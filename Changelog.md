# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

## 3.1.0 (2020-11-30)
  * New feature: fine-grain control over position. If you have a stop command configured and you have a transition interval defined, `homebridge-blinds-cmd` will now intelligently estimate where the blinds should be and reflect that value in HomeKit, as well as time stop commands to get to the appropriate position. What this means is that if you want to be able to "set blinds to 60%" you can now do that even if your blinds (e.g. Somfy) don't natively support this capability. To make this work you need to define the transition interval for your blinds (i.e. how long does it take to fully open or close the blind) and have a stop command configured for the blind. You also need to ensure your status scripts / commands are updated to reflect positions. See [somfy-bond.pl](https://github.com/hjdhjd/homebridge-blinds-cmd/blob/master/scripts/somfy-bond.pl) for a detailed example of how to implement this in practice.
  * Removed: support for a stop switch. You can use position control to stop the blind at any location, assuming you have the transition interval set and a stop command configured.

## 3.0.6 (2020-11-22)
  * Dependency updates.

## 3.0.5 (2020-10-11)
  * Fix: don't try to configure blind information if it's not provided.
  * Fix: remove blinds from HomeKit when they are no longer configured in Homebridge.

## 3.0.4 (2020-09-19)
  * Documentation updates and script examples.

## 3.0.3 (2020-09-19)
  * Documentation updates and script examples.

## 3.0.2 (2020-09-19)
  * Documentation updates and script examples.

## 3.0.1 (2020-09-06)
  * Properly name the stop switch for clarity.

## 3.0.0 (2020-09-06)
  * Refactored (again! :smile:) to be a platform plugin.
  * New feature: add the ability to stop a shade mid-flight. The stop capability is enabled with a switch. See documentation for more details.

## 2.0.1 (2020-08-10)
  * Minor fixes and sanity checking for status refresh functionality.

## 2.0.0 (2020-08-07)
  * Completely refactoring and modernization of this plugin.
  * **Breaking change: I've changed the name of the plugin in config.json. You will need to update your configuration to reflect this or Homebridge may not be able to successfully start. See the README for an example `config.json` block, or use the Homebridge webUI.**
  * New feature: state polling. Configure the plugin to periodically poll for status updates to ensure the status in HomeKit is always correct. This is especially useful when blinds might be independently be controlled outside of the plugin, and the true state isn't updated.
  * New feature: simulated delays. By default, `homebridge-blinds-cmd` will immediately execute and complete all state changes and update HomKit. In reality, there's usually a significant amount of time between starting an open or a close event, and the blinds completing the open or close action. This feature attempts to simulate the time it takes to complete an open or a close and correctly reflect that in HomeKit.
  * New feature: position reporting. You can have the status script return the position state as a number and it will be reflected in HomeKit.
  * New feature: position setting. When a command script is called, the position being requested will be appended to the command line. For example, if you configured the up command to be `upscript.sh`, `homebridge-blinds-cmd` will send `upscript.sh <position>` where position is a value from 0 to 100, depending on what the user selected in HomeKit.


