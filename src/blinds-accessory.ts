/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * blinds-accessory.ts: homebridge-blinds-cmd window covering accessory.
 */
import execa from "execa";
import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Logging,
  Service
} from "homebridge";

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  api.registerAccessory("homebridge-blinds-cmd", "Blinds Command", BlindsCmd);
};

interface configCmd {
  down: string;
  status: string;
  up: string;
}

class BlindsCmd implements AccessoryPlugin {
  private api: API;
  private blindsService!: Service;
  private readonly delay!: number;
  private readonly cmd: configCmd;
  private readonly config: AccessoryConfig;
  private readonly delayTime!: number;
  private currentPosition!: number;
  private informationService!: Service;
  private readonly log: Logging;
  private moveTimer!: NodeJS.Timeout;
  private readonly name: string;
  private pollingTimer!: NodeJS.Timeout;
  private positionState!: CharacteristicValue;
  private readonly refreshInterval!: number;
  private targetPosition!: number;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.api = api;
    this.config = config;
    this.log = log;

    // Name these blinds, primarily for logging purposes.
    this.name = config.name || "Blinds";

    // Get our commands to execute.
    this.cmd = { down: config.down, status: config.status, up: config.up };

    // No up or down commands defined, we're done.
    if(!this.cmd.up || !this.cmd.down) {
      this.log("No up or down commands have been configured for this plugin.");
      return;
    }

    // Configure our delay between state changes.
    this.delayTime = config.delay;

    // Configure our status refresh polling.
    this.refreshInterval = config.refresh;

    // Initialize the blinds. This is a value between 0 - 100, in single steps.
    this.currentPosition = 0;
    this.positionState = api.hap.Characteristic.PositionState.STOPPED;
    this.targetPosition = 0;

    this.configureBlinds();
  }

  private async configureBlinds(): Promise<void> {
    const Characteristic = this.api.hap.Characteristic;
    const Service = this.api.hap.Service;

    // Create our information service to set some informative parameters for these blinds.
    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, this.config.manufacturer || "Default Manufacturer")
      .setCharacteristic(Characteristic.Model, this.config.model || "Default Model")
      .setCharacteristic(Characteristic.Model, this.config.serial || "Default Serial");

    // Now create the window covering service.
    this.blindsService = new Service.WindowCovering(this.name);

    // Initialize our state as stopped.
    this.blindsService.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    // If we have a state command, use it to tell us where we should be on startup.
    if(this.cmd.status) {
      this.currentPosition = await this.execCommand(this.cmd.status);

      // If we had an error getting the initial state, assume the blinds are closed.
      if(this.currentPosition === -1) {
        this.currentPosition = 0;
      }
    }

    // Set the initial position for our blinds.
    this.targetPosition = this.currentPosition;
    this.blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
    this.blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);

    // Setup our event listeners.
    this.blindsService
      .getCharacteristic(Characteristic.CurrentPosition)!
      .on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this));

    this.blindsService
      .getCharacteristic(Characteristic.PositionState)!
      .on(CharacteristicEventTypes.GET, this.getPositionState.bind(this));

    this.blindsService
      .getCharacteristic(Characteristic.TargetPosition)!
      .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this))
      .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

    // Fire off our status polling, if configured.
    if(this.refreshInterval) {
      this.poll();
    }
  }

  // Get the current window covering state.
  private async getPositionState(callback: CharacteristicGetCallback) {
    callback(undefined, this.positionState);
  }

  // Get the current window covering state.
  private async getCurrentPosition(callback: CharacteristicGetCallback) {
    callback(undefined, this.currentPosition);
  }

  // Get the target window covering state.
  private async getTargetPosition(callback: CharacteristicGetCallback) {
    callback(undefined, this.targetPosition);
  }

  // Set the target window covering state and execute the action.
  private async setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const Characteristic = this.api.hap.Characteristic;

    // Stop polling for status since we're making some user-requested changes.
    if(this.refreshInterval) {
      clearTimeout(this.pollingTimer);
    }

    // We're already where we want to be, do nothing.
    if(value === this.currentPosition) {
      this.targetPosition = value;
      this.positionState = Characteristic.PositionState.STOPPED;

      this.blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);
      this.blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
      this.blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

      callback(null);
      this.poll();
      return;
    }

    // Figure out our move dynamics.
    const moveUp = value > this.currentPosition;
    this.targetPosition = value as number;
    this.positionState = moveUp ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING;

    // Tell HomeKit we're on the move.
    this.blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

    this.log((moveUp ? "Moving up." : "Moving down."));

    // Execute the move command.
    let newPosition = await this.execCommand((moveUp ? this.cmd.up : this.cmd.down) + " " + this.targetPosition);

    // Clear out the last delay timer, if configured one.
    if(this.delayTime) {
      clearTimeout(this.moveTimer);
    }

    // Something went wrong...cleanup and stop.
    if(newPosition === -1) {
      this.positionState = Characteristic.PositionState.STOPPED;
      this.blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);
      callback(Error("Error executing the move command."));
      this.poll();
      return;
    }

    // Special case - if we don't have a script that returns a position as output, we infer the
    // answer based on whether we are opening or closing, and assume we have opened or closed completely.
    if(!newPosition && moveUp) {
      newPosition = 100;
    }

    const self = this;

    // Set a timer to simulate an actual delay in completing the action to give us that interactive feeling.
    this.moveTimer = setTimeout(() => {
      // We've executed all the commands - we're done.
      self.currentPosition = newPosition;
      self.positionState = Characteristic.PositionState.STOPPED;

      self.blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(self.currentPosition);
      self.blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(self.currentPosition);
      self.blindsService.getCharacteristic(Characteristic.PositionState).updateValue(self.positionState);

      self.poll();
    }, this.delayTime * 1000);

    callback(null);
  }

  private async poll(): Promise<void> {
    const Characteristic = this.api.hap.Characteristic;

    // Clear the last polling interval out.
    clearTimeout(this.pollingTimer);

    // Setup periodic update with our polling interval.
    const self = this;

    this.pollingTimer = setTimeout(async () => {
      if(!self.cmd.status) {
        return;
      }

      // Get our updated state.
      const updatedPosition = await self.execCommand(self.cmd.status);

      // If we had an error getting the initial state, assume the blinds are closed.
      if(updatedPosition === -1) {
        return;
      }

      self.currentPosition = updatedPosition;
      self.targetPosition = updatedPosition;

      self.blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(self.currentPosition);
      self.blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(self.targetPosition);

      // Fire off the next polling interval.
      self.poll();
    }, this.refreshInterval * 1000);
  }

  // Execute a command, with error handling.
  private async execCommand(command: string): Promise<number> {
    try {
      const { stdout } = await execa.command(command, { shell: true });
      return parseInt(stdout);
    } catch(error) {
      this.log("Error executing the command: %s", error.shortMessage);
      return -1;
    }
  }

  // Required method to be called on instantiation. Returns all the services associated with this accessory.
  getServices(): Service[] {
    return [
      this.informationService,
      this.blindsService
    ];
  }
}
