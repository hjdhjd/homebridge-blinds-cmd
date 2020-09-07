/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * blindsCmd-blinds.ts: homebridge-blinds-cmd window covering accessory.
 */
import { BlindsCmdPlatform } from "./blindsCmd-platform";
import { BlindConfig } from "./blindsCmd-types";
import execa from "execa";
import {
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  PlatformAccessory,
  Service
} from "homebridge";
import {
  PLATFORM_NAME,
  PLUGIN_NAME
} from "./settings";

interface cmdOptions {
  down: string,
  status: string,
  up: string,
  stop: string
}

export class Blind {
  private accessory!: PlatformAccessory;
  private api: API;
  private readonly cmd: cmdOptions;
  private readonly config: BlindConfig;
  private currentPosition!: number;
  private debug: (message: string, ...parameters: unknown[]) => void;
  private readonly transitionInterval!: number;
  private readonly hap: HAP;
  private isMoving: boolean;
  private isStopped: boolean;
  private readonly log: Logging;
  private moveIncrement!: number;
  private moveTimer!: NodeJS.Timeout;
  private readonly name: string;
  private readonly platform: BlindsCmdPlatform;
  private pollingTimer!: NodeJS.Timeout;
  private positionState!: CharacteristicValue;
  private readonly refreshRate!: number;

  private targetPosition!: number;

  constructor(platform: BlindsCmdPlatform, blindConfig: BlindConfig) {
    this.api = platform.api;
    this.config = blindConfig;
    this.debug = platform.debug.bind(platform);
    this.hap = this.api.hap;
    this.isMoving = false;
    this.isStopped = false;
    this.log = platform.log;
    this.platform = platform;

    // Name these blinds, primarily for logging purposes.
    this.name = blindConfig.name;

    // Get our commands to execute.
    this.cmd = { down: blindConfig.down, status: blindConfig.status, up: blindConfig.up, stop: blindConfig.stop };

    // No up or down commands defined, we're done.
    if(!this.name || !this.cmd.up || !this.cmd.down) {
      return;
    }

    // Configure our delay between state changes.
    this.transitionInterval = blindConfig.transitionInterval;

    // Make sure we have a sane value for delay.
    if(this.transitionInterval < 0) {
      this.transitionInterval = 0;
    }

    // Calculate our move increment if we have a transition time set.
    this.moveIncrement = this.transitionInterval ? Math.round(100 / this.transitionInterval) : 100;

    // Configure our status refresh polling.
    this.refreshRate = blindConfig.refreshRate;

    // Make sure we have a sane value for refresh.
    if(this.refreshRate < 0) {
      this.refreshRate = 0;
    }

    // Initialize the blinds. This is a value between 0 - 100, in single steps.
    this.currentPosition = 0;
    this.positionState = this.api.hap.Characteristic.PositionState.STOPPED;
    this.targetPosition = 0;

    void this.configureBlind();
    this.configureInfo();
    this.configureStop();
  }

  // Configure the blind accessory.
  private async configureBlind(): Promise<boolean> {
    const Characteristic = this.api.hap.Characteristic;

    // Generate this Doorbird's unique identifier.
    const uuid = this.hap.uuid.generate("Blinds Command." + this.name);

    // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
    let accessory;
    if((accessory = this.platform.accessories.find(x => x.UUID === uuid)) === undefined) {

      this.accessory = new this.api.platformAccessory(this.name, uuid);

      // Register this accessory with homebridge and add it to the accessory array so we can track it.
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.platform.accessories.push(this.accessory);
    }

    // We already knew about this accessory after all, set it.
    if(accessory) {
      this.accessory = accessory;
    }

    // Clear out any previous window covering service.
    let blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    if(blindsService) {
      this.accessory.removeService(blindsService);
    }

    // Now add the window covering service.
    blindsService = new this.hap.Service.WindowCovering(this.accessory.displayName);
    this.accessory.addService(blindsService);

    // Initialize our state as stopped.
    blindsService.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    // If we have a state command, use it to tell us where we should be on startup.
    if(this.cmd.status) {
      this.currentPosition = await this.execCommand(this.cmd.status);

      // If we had an error getting the initial state, assume the blinds are closed.
      if(this.currentPosition !== this.currentPosition) {
        this.currentPosition = 0;
      }
    }

    // Set the initial position for our blinds.
    this.targetPosition = this.currentPosition;
    blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
    blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);

    // Setup our event listeners.
    blindsService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on(CharacteristicEventTypes.GET, this.getCurrentPosition.bind(this));

    blindsService
      .getCharacteristic(Characteristic.PositionState)
      .on(CharacteristicEventTypes.GET, this.getPositionState.bind(this));

    blindsService
      .getCharacteristic(Characteristic.TargetPosition)
      .on(CharacteristicEventTypes.GET, this.getTargetPosition.bind(this))
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

    // Fire off our status polling, if configured.
    if(this.refreshRate) {
      void this.poll();
    }

    // Inform the user of our configuration.
    this.log("%s: Commands configured: up, down%s%s.%s%s", this.accessory.displayName,
      this.cmd.stop ? ", stop" : "", this.cmd.status ? ", status" : "",
      this.transitionInterval ? " Transition time set to " + this.transitionInterval.toString() + " seconds." : "",
      this.refreshRate ? " Status refresh interval set to " + this.refreshRate.toString() + " seconds." : ""
    );

    return true;
  }

  // Configure the blind information for HomeKit.
  private configureInfo(): boolean {

    // Update the manufacturer information for this blind.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.Manufacturer).updateValue(this.config.manufacturer);

    // Update the model information for this blind.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.Model).updateValue(this.config.model);

    // Update the serial number for this blind.
    this.accessory
      .getService(this.hap.Service.AccessoryInformation)
      ?.getCharacteristic(this.hap.Characteristic.SerialNumber).updateValue(this.config.serial);

    return true;
  }

  // Configure a stop switch.
  private configureStop(): boolean {

    if(!this.cmd.stop) {
      return false;
    }

    const Characteristic = this.api.hap.Characteristic;

    // Clear out any previous switch service.
    let switchService = this.accessory.getService(this.hap.Service.Switch);

    if(switchService) {
      this.accessory.removeService(switchService);
    }

    // Now add the switch service.
    switchService = new this.hap.Service.Switch(this.accessory.displayName);
    this.accessory.addService(switchService);

    // Grab the blind service too.
    const blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    // If a stop command is configured, add a switch.
    switchService
      .getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        callback(null, this.isStopped === true);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        void (async (): Promise<void> => {
          this.log("%s: Stopping at %s%%.", this.accessory.displayName, this.currentPosition);

          // Stop any move in progress and execute the stop command.
          clearTimeout(this.moveTimer);
          this.isStopped = true;

          const newPosition = await this.execCommand(this.cmd.stop + " " + this.currentPosition.toString());

          // This validates that we didn't get NaN back. Use what we're told for our position.
          if(newPosition === newPosition) {

            this.currentPosition = newPosition;
            this.targetPosition = newPosition;

          } else {

            // Use our current position based on what we know instead.
            this.targetPosition = this.currentPosition;

          }

          // Let HomeKit know what the new states are.
          this.positionState = Characteristic.PositionState.STOPPED;

          blindsService?.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);
          blindsService?.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
          blindsService?.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

          callback(null);
        })();
      })
      .updateValue(false);

    return true;
  }

  // Get the current window covering state.
  private getPositionState(callback: CharacteristicGetCallback): void {
    callback(undefined, this.positionState);
  }

  // Get the current window covering state.
  private getCurrentPosition(callback: CharacteristicGetCallback): void {
    callback(undefined, this.currentPosition);
  }

  // Get the target window covering state.
  private getTargetPosition(callback: CharacteristicGetCallback): void {
    callback(undefined, this.targetPosition);
  }

  // Set the target window covering state and execute the action.
  private async setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback): Promise<void> {
    const Characteristic = this.hap.Characteristic;

    // Grab the blinds service.
    const blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    if(!blindsService) {
      callback(Error("Error finding the blinds service."));
      return;
    }

    // We're already where we want to be, do nothing.
    if(value === this.currentPosition) {
      this.targetPosition = value;
      this.positionState = Characteristic.PositionState.STOPPED;

      blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);
      blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
      blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

      callback(null);
      return;
    }

    // We're moving. We don't want any status refreshes until we complete the move.
    this.isMoving = true;

    // Figure out our move dynamics.
    const moveUp = value > this.currentPosition;
    this.targetPosition = value as number;
    this.positionState = moveUp ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING;

    // Tell HomeKit we're on the move.
    blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

    this.log("%s: Moving %s.", this.accessory.displayName, moveUp ? "up" : "down");

    // Execute the move command.
    let newPosition = await this.execCommand((moveUp ? this.cmd.up : this.cmd.down) + " " + this.targetPosition.toString());

    // Something went wrong...cleanup and stop.
    if(newPosition === -1) {
      clearTimeout(this.moveTimer);
      this.positionState = Characteristic.PositionState.STOPPED;
      blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);
      callback(Error("Error executing the move command."));
      this.isMoving = false;
      return;
    }

    // Special case - if we don't have a script that returns a position as output, we infer the
    // answer based on whether we are opening or closing, and assume we have opened or closed completely.
    if(!newPosition && moveUp) {
      newPosition = 100;
    }

    // Execute the move and we're done.
    this.moveBlind(blindsService, this.transitionInterval, newPosition, moveUp ? this.moveIncrement : this.moveIncrement * -1);

    callback(null);
  }

  // Poll for shade state updates.
  private async poll(): Promise<void> {
    const Characteristic = this.api.hap.Characteristic;

    // No status command configured, we're done.
    if(!this.cmd.status || !this.refreshRate) {
      return;
    }

    // Grab the blind.
    const blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    if(!blindsService) {
      return;
    }

    // Loop forever.
    for(;;) {

      // Sleep until our next update.
      // eslint-disable-next-line no-await-in-loop
      await this.sleep(this.refreshRate * 1000);

      // If we're moving, we don't want to poll right now.
      if(this.isMoving) {
        continue;
      }

      // Get our updated state.
      let updatedPosition;

      if(this.isStopped) {

        updatedPosition = this.currentPosition;

      } else {

        // eslint-disable-next-line no-await-in-loop
        updatedPosition = await this.execCommand(this.cmd.status);

      }

      // Only update our state if we received a valid status update.
      if(updatedPosition !== -1) {
        this.currentPosition = updatedPosition;
        this.targetPosition = updatedPosition;

        blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
        blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);
      }
    }
  }

  // Emulate a sleep function.
  private sleep(ms: number): Promise<NodeJS.Timeout> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private moveBlind(blindsService: Service, timeLeft: number, finalPosition: number, increment: number): void {

    const Characteristic = this.hap.Characteristic;

    // Clear out the previous delay timer, if one is configured.
    clearTimeout(this.moveTimer);

    // Set a timer to simulate an actual delay in completing the action to give us that interactive feeling.
    this.moveTimer = setTimeout(() => {

      // Increment our position.
      this.currentPosition += increment;

      // Bounds checking.
      if((this.currentPosition <= 0) || (this.currentPosition >= 100)) {
        timeLeft = 0;
      }

      // Reduce the time by a second. If we are under 0, we're done.
      if(--timeLeft < 0) {

        // We've executed all the commands - we're done.
        this.currentPosition = finalPosition;
        this.positionState = Characteristic.PositionState.STOPPED;

        blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.currentPosition);
        blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
        blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

        // We're done moving.
        this.isMoving = false;
        this.isStopped = false;

        this.accessory.getService(this.hap.Service.Switch)?.getCharacteristic(Characteristic.On).updateValue(this.isStopped);
        return;
      }

      // We're still moving. Update our current position, and let it go around.
      blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
      this.moveBlind(blindsService, timeLeft, finalPosition, increment);
    }, 1000);

  }

  // Execute a command, with error handling.
  private async execCommand(command: string): Promise<number> {
    try {
      const { stdout } = await execa.command(command, { shell: true });
      return parseInt(stdout);
    } catch(error) {

      if(!(error instanceof Error)) {
        this.log("Unknown error received while attempting to execute command %s: %s.", command, error);
        return -1;
      }

      this.log("Error executing the command: %s.", error.message);
      return -1;
    }
  }
}
