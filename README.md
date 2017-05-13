# homebridge-blinds-cmd

`homebridge-blinds-cmd` is a plugin for Homebridge that allows you to open or close your window blinds by executing a given command line.

Control your blinds via Homebridge by executing specific command lines for opening or closing.

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).
If you are running on a Raspberry, you will find a tutorial in the [homebridge-punt Wiki](https://github.com/cflurin/homebridge-punt/wiki/Running-Homebridge-on-a-Raspberry-Pi).

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
      "status_cmd": "/path/to/your/blinds_status_script",
    }
```

## Note
This plugin doesn't query nor have direct knowledge of the actual position of your blinds. Instead, it emulates the position based on your most recent request to raise / lower the blinds (i.e. it remembers what you last asked it to do and reports that back to HomeKit). Some blinds, such as Somfy, don't support querying their specific state.

This script is based on Robin Temme's excellent homebridge-blinds plugin, and I have merely adapted and updated it to support executing a script instead of calling URLs for opening and closing blinds. Feel free to contribute to make this a better plugin!

