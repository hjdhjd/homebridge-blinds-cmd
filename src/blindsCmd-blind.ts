/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * blindsCmd-blinds.ts: homebridge-blinds-cmd window covering accessory.
 */
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
import { BlindConfig } from "./blindsCmd-types";
import { BlindsCmdPlatform } from "./blindsCmd-platform";
import execa from "execa";

interface cmdOptions {
  down: string,
  status: string,
  up: string,
  stop: string
}

export class Blind {
  public accessory!: PlatformAccessory;
  private api: API;
  private readonly cmd: cmdOptions;
  private readonly config: BlindConfig;
  private currentPosition!: CharacteristicValue;
  private debug: (message: string, ...parameters: unknown[]) => void;
  private readonly transitionInterval!: number;
  private readonly hap: HAP;
  private isMoving: boolean;
  private readonly log: Logging;
  private moveIncrementInterval!: number;
  private moveTimer!: NodeJS.Timeout;
  private readonly name: string;
  private readonly platform: BlindsCmdPlatform;
  private pollingTimer!: NodeJS.Timeout;
  private positionState!: CharacteristicValue;
  private readonly refreshRate!: number;
  private targetPosition!: CharacteristicValue;

  constructor(platform: BlindsCmdPlatform, blindConfig: BlindConfig) {
    this.api = platform.api;
    this.config = blindConfig;
    this.debug = platform.debug.bind(platform);
    this.hap = this.api.hap;
    this.isMoving = false;
    this.log = platform.log;
    this.platform = platform;

    // Name these blinds, primarily for logging purposes.
    this.name = blindConfig.name;

    // Get our commands to execute.
    this.cmd = { down: blindConfig.down, status: blindConfig.status, stop: blindConfig.stop, up: blindConfig.up };

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

    // If we have a transition time set, calculate how many milliseconds are needed to increment the position by one, in milliseconds.
    this.moveIncrementInterval = this.transitionInterval ? (this.transitionInterval * 10) : 100;

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

    this.configureBlind();
    this.configureInfo();
    this.configureStop();
  }

  // Configure the blind accessory.
  private configureBlind(): boolean {
    const Characteristic = this.api.hap.Characteristic;

    // Generate this blind's unique identifier.
    const uuid = this.hap.uuid.generate("Blinds Command." + this.name);

    // See if we already know about this accessory or if it's truly new. If it is new, add it to HomeKit.
    let accessory;
    if((accessory = this.platform.accessories.find(x => x.UUID === uuid)) === undefined) {

      this.accessory = new this.api.platformAccessory(this.name, uuid);

      // Register this accessory with homebridge and add it to the accessory array so we can track it.
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.platform.accessories.push(this.accessory);
    }

    // We already had this accessory cached, let's use it.
    if(accessory) {
      this.accessory = accessory;
    }

    // Check to see if we already have a window covering service.
    let blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    // No window covering service found, let's add it.
    if(!blindsService) {

      // Now add the window covering service.
      blindsService = new this.hap.Service.WindowCovering(this.accessory.displayName);
      this.accessory.addService(blindsService);

    }

    // Initialize our state as stopped.
    blindsService.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    // See if we have saved a state for our blind.
    this.currentPosition = -1;

    if("blindPosition" in this.accessory.context) {
      this.currentPosition = this.accessory.context.blindPosition as CharacteristicValue;
    }

    // If we have a state command, use it to tell us where we should be on startup.
    if(this.cmd.status) {
      this.currentPosition = this.execCommand(this.cmd.status + (this.currentPosition !== -1 ? " " + this.currentPosition.toString() : ""));
    }

    // If we had an error getting the initial state, assume the blinds are closed.
    if(this.currentPosition === -1) {
      this.currentPosition = 0;
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
      .on(CharacteristicEventTypes.SET, this.setTargetPosition.bind(this));

    // Fire off our status polling, if configured.
    if(this.refreshRate) {
      void this.poll();
    }

    // Inform the user of our configuration.
    this.log.info("%s: Commands configured: up, down%s%s.%s%s", this.accessory.displayName,
      this.cmd.stop ? ", stop" : "",
      this.cmd.status ? ", status" : "",
      this.transitionInterval ? " Transition time set to " + this.transitionInterval.toString() + " seconds." : "",
      this.refreshRate ? " Status refresh interval set to " + this.refreshRate.toString() + " seconds." : ""
    );

    return true;
  }

  // Configure the blind information for HomeKit.
  private configureInfo(): boolean {

    // Update the manufacturer information for this blind.
    if(this.config.manufacturer) {
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)
        ?.getCharacteristic(this.hap.Characteristic.Manufacturer).updateValue(this.config.manufacturer);
    }

    // Update the model information for this blind.
    if(this.config.model) {
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)
        ?.getCharacteristic(this.hap.Characteristic.Model).updateValue(this.config.model);
    }

    // Update the serial number for this blind.
    if(this.config.serial) {
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)
        ?.getCharacteristic(this.hap.Characteristic.SerialNumber).updateValue(this.config.serial);
    }

    return true;
  }

  // Configure a stop switch.
  private configureStop(): boolean {

    // Clear out any previous switch service.
    const switchService = this.accessory.getService(this.hap.Service.Switch);

    if(switchService) {
      this.accessory.removeService(switchService);
    }

    return true;
  }

  // User-friendly name for a given position.
  private getPositionName(position: CharacteristicValue): string {

    switch(position) {
      case 0:
        return "closed";
        break;

      case 100:
        return "open";
        break;

      default:
        return position.toString() + "%";
        break;
    }
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
  private setTargetPosition(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    const Characteristic = this.hap.Characteristic;

    // Grab the blinds service.
    const blindsService = this.accessory.getService(this.hap.Service.WindowCovering);

    if(!blindsService) {
      callback(Error("Error finding the blinds service."));
      return;
    }

    // We're already where we want to be, do nothing. If we don't have a status command then
    // we might not know about a manual input to the blind, so send the control even if we think
    // we're already there.
    if(this.cmd.status && value === this.currentPosition) {
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
    this.targetPosition = value;
    this.positionState = moveUp ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING;

    // Tell HomeKit we're on the move.
    blindsService.getCharacteristic(Characteristic.PositionState).updateValue(this.positionState);

    this.log.info("%s: Moving %s from %s to %s.", this.accessory.displayName, moveUp ? "up" : "down",
      this.getPositionName(this.currentPosition), this.getPositionName(this.targetPosition));

    // Execute the move command.
    let newPosition = this.execCommand((moveUp ? this.cmd.up : this.cmd.down) + " " + this.targetPosition.toString());

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
    this.moveBlind(blindsService, newPosition, moveUp ? 1 : -1);

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
      const updatedPosition = this.execCommand(this.cmd.status + " " + this.currentPosition.toString());

      // Only update our state if we received a valid status update.
      if(updatedPosition !== -1) {

        this.accessory.context.blindPosition = this.targetPosition = this.currentPosition = updatedPosition;

        blindsService.getCharacteristic(Characteristic.CurrentPosition).updateValue(this.currentPosition);
        blindsService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);

      }
    }
  }

  // Emulate a sleep function.
  private sleep(ms: number): Promise<NodeJS.Timeout> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Move a blind in HomeKit.
  private moveBlind(blindsService: Service, finalPosition: CharacteristicValue, increment: CharacteristicValue): void {

    // Clear out the previous delay timer, if one is configured.
    clearTimeout(this.moveTimer);

    // Set a timer to simulate an actual delay in completing the action to give us that interactive feeling.
    this.moveTimer = setTimeout(() => {

      // Increment our position.
      this.accessory.context.blindPosition = (this.currentPosition as number) += (increment as number);

      // If we exceed our bounds or we're at our final position, we're done.
      if((this.currentPosition <= 0) || (this.currentPosition >= 100) || (this.currentPosition === finalPosition)) {

        // Our final position is something other than completely open or completely closed.
        if((this.currentPosition > 0) && (this.currentPosition < 100)) {

          // Trigger the stop script, if we have one configured.
          const newPosition = this.stopBlind();

          if(newPosition !== -1) {
            finalPosition = newPosition;
          }
        }

        // Update the final values and tell HomeKit we're done.
        this.accessory.context.blindPosition = this.targetPosition = this.currentPosition = finalPosition;
        this.positionState = this.hap.Characteristic.PositionState.STOPPED;

        blindsService.getCharacteristic(this.hap.Characteristic.TargetPosition).updateValue(this.targetPosition);
        blindsService.getCharacteristic(this.hap.Characteristic.CurrentPosition).updateValue(this.currentPosition);
        blindsService.getCharacteristic(this.hap.Characteristic.PositionState).updateValue(this.positionState);

        // We're done moving.
        this.isMoving = false;
        return;
      }

      // We're still moving. Update our current position, and let's keep moving.
      blindsService.getCharacteristic(this.hap.Characteristic.CurrentPosition).updateValue(this.currentPosition);
      this.moveBlind(blindsService, finalPosition, increment);

    }, this.moveIncrementInterval);

  }

  // Stop a blind in HomeKit.
  private stopBlind(): number {

    // Only execute if we've configured a stop command.
    if(!this.cmd.stop) {
      return -1;
    }

    // Execute and return.
    return this.execCommand(this.cmd.stop + " " + this.currentPosition.toString());
  }

  // Execute a command, with error handling.
  private execCommand(command: string): number {
    try {

      // We only want the stdout property from the return of execa.command.
      const { stdout } = execa.commandSync(command, { shell: true });

      // Parse the return value.
      const returnValue = parseInt(stdout);

      // Validate the return value.
      if(isNaN(returnValue) || (returnValue < 0) || (returnValue > 100)) {
        this.log.error("Invalid value returned when executing command %s: %s. A numeric value between 0 and 100 is expected.", command, returnValue);
        return -1;
      }

      // Return the value.
      return returnValue;

    } catch(error) {

      if(!(error instanceof Error)) {
        this.log.error("Unknown error received while attempting to execute command %s: %s.", command, error);
        return -1;
      }

      this.log.error("Error executing the command: %s.", error.message);
      return -1;

    }
  }
}
