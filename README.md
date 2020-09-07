<SPAN ALIGN="CENTER">

[![homebridge-blinds-cmd: Native HomeKit support for non-smart motorized blinds through command-line scripts](https://raw.githubusercontent.com/hjdhjd/homebridge-blinds-cmd/master/homebridge-blinds-cmd.svg)](https://github.com/hjdhjd/homebridge-blinds-cmd)

# Homebridge Blinds Command

[![Downloads](https://img.shields.io/npm/dt/homebridge-blinds-cmd?color=%23333333&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-blinds-cmd)
[![Version](https://img.shields.io/npm/v/homebridge-blinds-cmd?label=Blinds%20Cmd%202&color=%23333333&logo=node.js&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-blinds-cmd)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%2357277C&style=for-the-badge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

## HomeKit support for non-smart motorized blinds through command-line scripts.
</SPAN>

`homebridge-blinds-cmd` is a [Homebridge](https://homebridge.io) plugin that allows you to raise, lower, and get the current position of your window blinds by executing a given command-line or script. It makes a HomeKit window covering accessory available to you that can report status and be controlled entirely through command-line scripts.

## Why use this plugin for window blinds support in HomeKit?
These days, there is a decent selection of window blinds available on the market with native HomeKit support. However, there are also blinds systems, such as Somfy, which don't have any meaningful HomeKit support. Add to that the proprietary remote protocols and you're in for a challenge in trying to make window blinds part of your [HomeKit](https://www.apple.com/ios/home) smart home.

There are other blinds plugins for Homebridge that are either tailored to specific blinds solutions, or more broadly focused on blinds that can be controlled through HTTP -- and they do a great job if that's what you're seeking. You can certainly do those things with this plugin, though you'll be writing your own scripts to do so. So why use this plugin in particular in this scenario? Well, in some cases you've got complex state conditions you want to reflect in HomeKit.

For instance, let's take the example of a living room with two motorized Somfy shades (I'm picking Somfy for this example because it's what I'm most familiar with, but other brands have similar concepts). In our example, we have a remote control that has three presets configured - one to control the first shade, one to control the second shade, and one to control both simultaneously. Controlling each of the individual shades is an easy enough task for most of the blinds-related Homebridge plugins.

That last scenario though can be tricky. What if you want to expose, for the sake of argument, the three presets described above as three shades in HomeKit. What you'd like is that when you raise or lower that third preset, the one that controls two shades simultaneously, that HomeKit also reflects the updates across those shades. This type of relational mapping between shades and presets can be challenging to make work. That's what this plugin is for. Allowing you to do easy things like controlling an individual shade and providing you the flexibility to implement more complex things, should you choose to do so, in the form of command-line scripts.

### Changelog
Changelog starting with v2.0 is available [here](https://github.com/hjdhjd/homebridge-blinds-cmd/blob/master/Changelog.md).

## Installation
If you are new to Homebridge, please first read the [Homebridge](https://homebridge.io) [documentation](https://github.com/homebridge/homebridge/wiki) and installation instructions before proceeding.

If you have installed the [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x), you can intall this plugin by going to the `Plugins` tab and searching for `homebridge-blinds-cmd` and installing it.

If you prefer to install `homebridge-blinds-cmd` from the command line, you can do so by executing:

```sh
sudo npm install -g homebridge-blinds-cmd
```

## Configuration
I would strongly recommend using the [Homebridge Config UI](https://github.com/oznu/homebridge-config-ui-x) rather than editing your config.json directly. It does a good job of showing you all the options and always generating a valid configuration so you don't get stuck on typos or looking for stray commas in your `config.json`.

For those that prefer configuring things directly, add the accessory in `config.json` in your home directory inside `.homebridge`.

```js
   {
      "accessory": "Blinds Command",
      "manufacturer": "Somfy",
      "model": "Sonesse",
      "serial": "1234",
      "name": "Downstairs Window Blinds",
      "up": "/path/to/your/raise_blinds_script",
      "down": "/path/to/your/lower_blinds_script",
      "status": "/path/to/your/blinds_state_script",
      "stop": "/path/to/your/stop_blinds_script",
      "transitionInterval": 30,
      "refreshRate": 5
    }
```

### Options
* `up`, `down`, `stop`, and `status` should point to scripts or command lines to run to execute those actions. `up` and `down` are required, and all others are optional.
* Setting a `stop` command will create an additional switch that you can use to stop the blind when it is moving. Unfortunately, HomeKit doesn't allow for the concept of stopping a blind while it is moving - your choices are to open or close. To workaround this limitation, a switch service is added to the blind that allows you to stop the blind when it's moving.
* `accessory`, `manufacturer`, `model`, and `serial` are optional settings to allow you to further identify your blinds in HomeKit.
* `transitionInterval` is an optional setting that allows you to simulate a blind transition movement between open and closed. If it takes 10 seconds for the blinds to open, enter `10` here and `homebridge-blinds-cmd` will simulate the time it takes to complete that transition in HomeKit.
* `refreshRate` will execute the `status` command at whatever refresh rate you set, in seconds. This is useful when the state of your blinds changes outside of HomeKit, and you want to regularly check it's status.

### Script inputs and outputs
`homebridge-blinds-cmd` expected the following:

* **`status` script:** Should output a number from 0 to 100 to inform HomeKit of what the current position of the blind is.
* **`up`, `down`, or `stop` script:** Must be able to accept an additional argument containing the position that's been requested by the user.
  For example:

    ```js
      {
         ...
         "up": "/path/to/raise_blinds_script"
         ...
      }
    ```

  The above configured script will be called as <CODE>/path/to/raise_blinds_script <I>100</I></CODE>, where 100 is whatever value was requested by the end user and passed on to HomeKit. This should enable those who wish to take advantage of situations where you may want to only open a shade half way, to do so. Finally, the script should output a number from 0 to 100 to inform HomeKit of what the new position of the blind is.

## Notes
This plugin doesn't query nor have direct knowledge of the actual position of your blinds. Instead, it emulates the position based on your most recent request to raise / lower the blinds (i.e. it remembers what you last asked it to do and reports that back to HomeKit). Some blinds, such as Somfy, don't support querying their specific state. That said, if you do wish to use a specific position, you can do so. It's passed as the last argument to the up and down script configuration options. How you choose to handle it, is up to you. What your plugin should output is the position it wants to HomeKit (e.g. 100 if the blind is fully open).

A sample control script for Somfy is included. This script is provided as an example of what is possible. Your mileage may vary - this script was tested on a Mac and should work on other platforms, best of luck. It assumes the use of a [Somfy URTSI](https://www.somfysystems.com/products/1810872/universal-rts-interface) attached to an [iTach Flex](https://www.globalcache.com/products/flex/)) via serial. The script is fairly robust and allows for multiple URTSI scenarios including multiple URTSIs and shade groups.

I've also used, and am using, a [Bond Bridge](https://www.bondhome.io). It's a terrific device with builtin support for Somfy RF signals as well as a wide variety of IR and RF formats for shades, ceiling fans, and fireplaces. I highly recommend it as a more robust alternative to the Somfy URTSI, and at a much better price point.