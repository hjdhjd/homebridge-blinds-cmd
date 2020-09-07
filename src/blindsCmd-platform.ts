/* Copyright(C) 2017-2020, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * blindsCmd-platform.ts: homebridge-blinds-cmd platform class.
 */
import { Blind } from "./blindsCmd-blind";
import { BlindsCmdConfig, BlindConfig } from "./blindsCmd-types";
import { API, APIEvent, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from "homebridge";
import util from "util";

export class BlindsCmdPlatform implements DynamicPlatformPlugin {
  public accessories: PlatformAccessory[] = [];
  public readonly api: API;
  private readonly blinds: Blind[] = [];
  private config: BlindsCmdConfig;
  public debugMode = false;
  public readonly log: Logging;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api;

    // Force this to DoorbirdConfig.
    this.config = {
      blinds: config.blinds as BlindConfig[]
    };

    this.log = log;

    // We can't start without being configured.
    if(!config) {
      return;
    }

    // We need a Doorbird configured to do anything.
    if(!config.blinds) {
      this.log("No blinds have been configured.");
      return;
    }

    // Capture configuration parameters.
    if(config.debug) {
      this.debugMode = config.debug === true;
      this.debug("Debug logging on. Expect a lot of data.");
    }

    // Avoid a prospective race condition by waiting to configure our blinds until Homebridge is done
    // loading all the cached accessories it knows about, and calling configureAccessory() on each.
    api.on(APIEvent.DID_FINISH_LAUNCHING, this.configureBlinds.bind(this));
  }

  // This gets called when homebridge restores cached accessories at startup. We
  // intentionally avoid doing anything significant here, and save all that logic
  // for device discovery.
  configureAccessory(accessory: PlatformAccessory): void {

    // Add this to the accessory array so we can track it.
    this.accessories.push(accessory);
  }

  // Configure our blinds.
  private configureBlinds(): void {

    // Loop through each configured blind and instantiate it.
    for(const blindsConfig of this.config.blinds) {

      // No name or up or down commands defined, we're done.
      if(!blindsConfig.up || !blindsConfig.down || !blindsConfig.name) {
        this.log("Name, up, and down commands are required configuration parameters.");
        continue;
      }

      this.blinds.push(new Blind(this, blindsConfig));
    }
  }

  // Utility for debug logging.
  debug(message: string, ...parameters: unknown[]): void {
    if(this.debugMode) {
      this.log(util.format(message, ...parameters));
    }
  }
}
