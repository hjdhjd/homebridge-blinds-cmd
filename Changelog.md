# Changelog

All notable changes to this project will be documented in this file. This project uses [semantic versioning](https://semver.org/).

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


