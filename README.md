<span align="center">

<a href="https://github.com/homebridge/verified/blob/master/verified-plugins.json"><img alt="homebridge-verified" src="https://github.com/homebridge/branding/blob/master/logos/homebridge-color-round.svg?sanitize=true" width="140px"></a>

# Homebridge Blinds Command

<a href="https://www.npmjs.com/package/homebridge-blinds-cmd"><img title="npm version" src="https://badgen.net/npm/v/homebridge-blinds-cmd" ></a>
<a href="https://www.npmjs.com/package/homebridge-blinds-cmd"><img title="npm downloads" src="https://badgen.net/npm/dt/homebridge-blinds-cmd" ></a>

<p><a href="https://homebridge.io">Homebridge</a> blinds accessory, powered by scripts or the command line.</p>

</span>

# Homebridge Blinds Command

`homebridge-blinds-cmd` is a [Homebridge](https://www.npmjs.com/packages/homebridge)  plugin that allows you to raise or loweer your window blinds by executing a given command line or script.

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

Install homebridge:
```sh
sudo npm install -g homebridge
```
Install homebridge-blinds-cmd:
```sh
sudo npm install -g homebridge-blinds-cmd
```

## Configuration

Add the accessory in `config.json` in your home directory inside `.homebridge`.

```js
   {
      "accessory": "BlindsCMD",
      "manufacturer": "Somfy",
      "model": "Sonesse",
      "serial": "1234",
      "name": "Downstairs Window Blinds",
      "up_cmd": "/path/to/your/raise_blinds_script",
      "down_cmd": "/path/to/your/lower_blinds_script",
      "state_cmd": "/path/to/your/blinds_state_script",
    }
```

## Notes
This plugin doesn't query nor have direct knowledge of the actual position of your blinds. Instead, it emulates the position based on your most recent request to raise / lower the blinds (i.e. it remembers what you last asked it to do and reports that back to HomeKit). Some blinds, such as Somfy, don't support querying their specific state.

A sample control script for Somfy is included. This script is provided as an example of what is possible. Your mileage may vary - this script was tested on a Mac and should work on other platforms, best of luck. It assumes the use of a [Somfy URTSI](https://www.somfysystems.com/products/1810872/universal-rts-interface) attached to an [iTach Flex](https://www.globalcache.com/products/flex/)) via serial. The script is fairly robust and allows for multiple URTSI scenarios including multiple URTSIs and shade groups.

This script is based on Robin Temme's excellent homebridge-blinds plugin, and I have merely adapted and updated it to support executing a script instead of calling URLs for opening and closing blinds. Feel free to contribute to make this a better plugin!

