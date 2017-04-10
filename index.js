var request = require("request");
var exec = require("child_process").exec;
var Service, Characteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-blinds", "BlindsCMD", BlindsCMDAccessory);
}

function BlindsCMDAccessory(log, config) {
    // global vars
    this.log = log;

    // configuration vars
    this.name = config["name"];
    this.upCMD = config["up_cmd"];
    this.downCMD = config["down_cmd"];

    // state vars
    this.lastPosition = 0; // last known position of the blinds, down by default
    this.currentPositionState = 2; // stopped by default
    this.currentTargetPosition = 0; // down by default

    // register the service and provide the functions
    this.service = new Service.WindowCovering(this.name);

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
    this.log("Requested CurrentPosition: %s", this.lastPosition);
    callback(null, this.lastPosition);
}

BlindsCMDAccessory.prototype.getPositionState = function(callback) {
    this.log("Requested PositionState: %s", this.currentPositionState);
    callback(null, this.currentPositionState);
}

BlindsCMDAccessory.prototype.getTargetPosition = function(callback) {
    this.log("Requested TargetPosition: %s", this.currentTargetPosition);
    callback(null, this.currentTargetPosition);
}

BlindsCMDAccessory.prototype.setTargetPosition = function(pos, callback) {
    this.log("Set TargetPosition: %s", pos);
    this.currentTargetPosition = pos;
    const moveUp = ((this.currentTargetPosition != 0) && (this.currentTargetPosition >= this.lastPosition));
    this.log((moveUp ? "Moving up" : "Moving down"));

    this.service
        .setCharacteristic(Characteristic.PositionState, (moveUp ? 1 : 0));

    this.cmdRequest((moveUp ? this.upCMD : this.downCMD), function(error, stdout, stderr) {
      if (error) {
	this.log('power function failed: %s', stderr);
	callback(error);
      } else {
      	this.log("Success moving %s", (moveUp ? "up (to 100)" : "down (to 0)"))

	this.service
           .setCharacteristic(Characteristic.CurrentPosition, (moveUp ? 100 : 0));
	this.service
           .setCharacteristic(Characteristic.PositionState, 2);
	this.lastPosition = (moveUp ? 100 : 0);

	this.log('power function succeeded!');
	callback(null);
	this.log(stdout);
      }
    }.bind(this));
}

BlindsCMDAccessory.prototype.cmdRequest = function(cmd, callback) {
  exec(cmd, function(error, stdout, stderr) {
    callback(error, stdout, stderr)
  });
}

BlindsCMDAccessory.prototype.getServices = function() {
  return [this.service];
}
