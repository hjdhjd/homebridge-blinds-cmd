var request = require("request");
var exec = require("child_process").exec;
var Service, Characteristic;
var BlindsCMDDebug = 0;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-blinds", "BlindsCMD", BlindsCMDAccessory);
}

function BlindsCMDAccessory(log, config) {
    // global vars
    this.log = log;

    // serial and manufacturer info
    this.serial = config["serial"] || "Default-SerialNumber";
    this.model = config["model"] || "Default-Model";
    this.manufacturer = config["manufacturer"] || "Default-Manufacturer";

    // configuration vars
    this.name = config["name"];
    this.upCMD = config["up_cmd"];
    this.downCMD = config["down_cmd"];
    this.stateCMD = config["state_cmd"];

    // state vars
    this.lastPosition = 0; // last known position of the blinds, down by default
    this.currentPositionState = Characteristic.PositionState.STOPPED; // stopped by default
    this.currentTargetPosition = 0; // down by default

    // register the service and provide the functions
    this.service = new Service.WindowCovering(this.name);

    // initialize the current window state.
   this.service
       .setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

   // initialize the current position based on external status information, if available.
   if(this.stateCMD) {
     this.lastState(function(error, lPos) {
       if (error) {
         this.log('Unable to initialize query current position');
       } else {
         this.service
             .setCharacteristic(Characteristic.CurrentPosition, lPos);
         this.service
             .setCharacteristic(Characteristic.TargetPosition, lPos);
         this.lastPosition = lPos;
       }
     }.bind(this));
   }

    // the current position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L493
    this.service
        .getCharacteristic(Characteristic.CurrentPosition)
        .on('get', this.getCurrentPosition.bind(this));

    // the position state
    // 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1138
    this.service
        .getCharacteristic(Characteristic.PositionState)
        .on('get', this.getPositionState.bind(this));

    // the target position (0-100%)
    // https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L1564
    this.service
        .getCharacteristic(Characteristic.TargetPosition)
        .on('get', this.getTargetPosition.bind(this))
        .on('set', this.setTargetPosition.bind(this));

}

BlindsCMDAccessory.prototype.getCurrentPosition = function(callback) {
    this.lastState(function(error, lPos) {
      if (error) {
        this.log('Unable to retrieve current position');
        callback(error);
      } else {
        if (BlindsCMDDebug) this.log("Requested CurrentPosition: %s", lPos);
        callback(null, lPos);
      }
    }.bind(this));
}

BlindsCMDAccessory.prototype.getPositionState = function(callback) {
    if (BlindsCMDDebug) this.log("Requested PositionState: %s", this.currentPositionState);
    callback(null, this.currentPositionState);
}

BlindsCMDAccessory.prototype.getTargetPosition = function(callback) {
    if (BlindsCMDDebug) this.log("Requested TargetPosition: %s", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

BlindsCMDAccessory.prototype.setTargetPosition = function(pos, callback) {
    if (BlindsCMDDebug) this.log("Set TargetPosition: %s", pos);
    this.currentTargetPosition = pos;

    this.lastState(function(error, lPos) {
      if (error) {
        this.log('Unable to query current position');
        callback(error);
      } else {
        const moveUp = ((this.currentTargetPosition != 0) && (this.currentTargetPosition >= lPos));
        this.log((moveUp ? "Moving up" : "Moving down"));

        this.cmdRequest(moveUp, (moveUp ? this.upCMD : this.downCMD), function(error, stdout, stderr) {
          if (error) {
    	    this.log('Move function failed: %s', stderr);
	    callback(error);
          } else {
      	    this.log("Success moving %s", (moveUp ? "up (to 100)" : "down (to 0)"))

	    this.lastPosition = (moveUp ? 100 : 0);

	    // set our current position and set our position to stopped.
            this.service
                .setCharacteristic(Characteristic.CurrentPosition, this.lastPosition);
            this.currentPositionState = Characteristic.PositionState.STOPPED;
            this.service
                .setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

	    if (BlindsCMDDebug) this.log('Move function succeeded.');
	    callback(null);
	    if (BlindsCMDDebug) this.log('Move command output: ' + stdout);
          }
	    // just in case.
            this.currentPositionState = Characteristic.PositionState.STOPPED;
            this.service
                .setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
        }.bind(this));
      }
    }.bind(this));
}

BlindsCMDAccessory.prototype.lastState = function(callback) {
  if(this.stateCMD) {
    exec(this.stateCMD, function(error, stdout, stderr) {
      callback(error, parseInt(stdout));
    });
  } else {
    callback(null, this.lastPosition);
  }
}

BlindsCMDAccessory.prototype.cmdRequest = function(moveUp, cmd, callback) {
  this.currentPositionState = (moveUp ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING);
  this.service
    .setCharacteristic(Characteristic.PositionState, (moveUp ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING));

  exec(cmd, function(error, stdout, stderr) {
    callback(error, stdout, stderr)
  });
}

BlindsCMDAccessory.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();
  
  informationService
    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
    .setCharacteristic(Characteristic.Model, this.model)
    .setCharacteristic(Characteristic.SerialNumber, this.serial);
   
  return [this.service, informationService];
}
