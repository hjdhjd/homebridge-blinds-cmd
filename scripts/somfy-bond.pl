#!/usr/bin/env perl
#
# Copyright(C) 2017-2020, HJD. https://github.com/hjdhjd
#
# Example Bond Control Script for Somfy Shades.
#
# This assumes that we are talking to a Bond Bridge (https://bondhome.io/products/bond-bridge/)
# that is attached to your network, and that you've already setup the Bond Bridge with your Somfy
# shades. This script enabled access to configured shades within Bond Bridge.
#
# In my experience, you don't need to repeat signals when using a Bond Bridge - it has a pretty
# impressive range.
#
# Example commands for your Homebridge config.json with homebridge-blinds-cmd:
#
#   "up": "~/path/to/somfy.pl 3 up",
#   "down": "~/path/to/somfy.pl 3 down",
#   "stop": "~/path/to/somfy.pl 3 stop",
#   "state": "~/path/to/somfy.pl 3 status"
#
use strict;
use warnings;

use Switch;
use JSON::Parse qw(parse_json);
use FindBin qw($Bin);
use Time::HiRes qw(usleep);
require LWP::UserAgent;

my $BOND_IP = "YOUR.BOND.BRIDGE.IP.ADDRESS";
my $BOND_TOKEN = "YOUR.BOND.BRIDGE.TOKEN";
my $REPEATCOUNT = 5;
my $USAGE = "Usage: $0 <shade> <up | down | stop | status> [repeat] [position]\n";

my %BOND_DEVICE = (
  "Shade 1" => "BOND.SHADE1.DEVICE.ID",
  "Shade 2" => "BOND.SHADE2.DEVICE.ID",
  "Shade 3" => "BOND.SHADE2.DEVICE.ID",
  "Shade 4" => "BOND.SHADE2.DEVICE.ID",
  "Shade 5" => "BOND.SHADE2.DEVICE.ID"
);

# Window mapping so we understand groups of windows being controlled.
#
# In this case, Shade 5 is really controlling shades 3 and 4. Somfy allows you to create these groupings
# so you can raise and lower a group of shades at once with a single signal. We need this mapping so we
# can update the status of the individual component shades in HomeKit as well as the grouped shade.
#
my %WMAP = (
  "Shade 5" => [ ("Shade 3", "Shade 4") ]
);

# Command line argument processing.
#
my $SHADE = shift or die $USAGE;

die $USAGE if !defined($SHADE);
die "Unable to find the device to use for shade $SHADE\n" unless defined($BOND_DEVICE{$SHADE});

my $COMMAND = shift or die $USAGE;

# See if we need to repeat this command a few times to ensure the signal gets through, or if
# we specified the position we want to move to, or both.
#
my $OPTIONREPEAT = shift;
my $OPTIONPOSITION = shift;
my $POSITION;
my $REPEAT;

if(defined($OPTIONREPEAT)) {
  $REPEAT = $REPEATCOUNT if $OPTIONREPEAT =~ /^repeat$/i;
  $POSITION = int($OPTIONREPEAT) if $OPTIONREPEAT =~ /^[0-9]+$/;

  die $USAGE unless defined($POSITION) || defined($REPEAT);
}

# We specified a position, rather than a repeat above.
$REPEAT = 1 if !defined($REPEAT);

# Explicit position specified - make sure it's a valid value.
$POSITION = int($OPTIONPOSITION) if(defined($OPTIONPOSITION) && $OPTIONPOSITION =~ /^[0-9]+$/);
die $USAGE if(defined($OPTIONPOSITION) && !defined($POSITION));

$POSITION = 0 if(defined($POSITION) && ($POSITION < 0));
$POSITION = 100 if(defined($POSITION) && ($POSITION > 100));

# Execute our commands.
switch($COMMAND) {
  case /^(up|open)$/      { my $returnValue = moveShade($SHADE, "Open"); print $returnValue . "\n" unless $returnValue == -1; }
  case /^(down|close)$/   { my $returnValue = moveShade($SHADE, "Close"); print $returnValue . "\n" unless $returnValue == -1; }
  case /^(stop|hold)$/    { my $returnValue = moveShade($SHADE, "Hold"); }
  case "status"           { my $returnValue = getStatus($SHADE); print $returnValue . "\n" unless $returnValue == -1; }
  else                    { die $USAGE}
}

# Return the status of a shade from Bond.
#
sub getStatus {
  return if scalar(@_) != 1;

  # Only argument we accept is which shade to get the status for.
  my $shadeTarget = shift @_;

  # Create the request.
  #
  my $ua = LWP::UserAgent->new or die "Error creating a new UserAgent: $!\n";

  $ua->default_header("Bond-Token" => $BOND_TOKEN);

  # Send Bond command to access the Somfy shade state:
  # http://bond/v2/devices/device_id/actions/action_type
  my $cmd = "http://$BOND_IP/v2/devices/$BOND_DEVICE{$shadeTarget}/state";

  my $response = $ua->get($cmd);
  my $reply = parse_json($response->decoded_content);

  # Receive the response and check to see if there is an issue.
  #
  if($response->is_success) {
    # Bond returns 1 on open, 0 on closed. Translate that to a position for HomeKit by
    # multiplying by 100.
    return $reply->{open} * 100;
  } else {
    print "Command failed: " . $response->status_line . "\n" unless $response->is_success;
    return -1;
  }
}

# Move shades up or down.
#
sub moveShade {
  return if scalar(@_) != 2;

  # Arguments are shade, direction.
  my $shadeTarget = shift @_;
  my $moveDirection = shift @_;
  my $moveResult = 0;

  # Repeat the command as many times as requested, and only once otherwise.
  for(; $REPEAT > 0; $REPEAT--) {

    # Create the request.
    my $ua = LWP::UserAgent->new or die "Error creating a new UserAgent: $!\n";

    $ua->default_header("Bond-Token" => $BOND_TOKEN);

    # Send Bond command to control Somfy shades:
    # http://bond/v2/devices/device_id/actions/action_type
    my $response = $ua->put("http://$BOND_IP/v2/devices/$BOND_DEVICE{$shadeTarget}/actions/$moveDirection", Content => "{}");

    # Receive the response and check to see if there is an issue.
    if($response->is_success) {
      $moveResult = 1;

      my $positionValue = 0;
      $positionValue = 1 if (($moveDirection eq "Open") || ($moveDirection eq "Hold"));

      # If this is a linked shade (meaning a shade that's really composed of multiple other shades),
      # update status of all the component shades as well that just moved.
      if($WMAP{$shadeTarget}) {
        my @componentShades = @{$WMAP{$shadeTarget}};
        foreach(@componentShades) {
          my $res = $ua->patch("http://$BOND_IP/v2/devices/$BOND_DEVICE{$_}/state", Content => "{\"open\": $positionValue}");
          print "Component shade update failed: " . $res->status_line . "\n" unless $res->is_success;
        }
      }

      # If the state is to hold / stop the shade, we want to force it open since it's really in an unknown state, neither open
      # nor closed.
      #
      if($moveDirection eq "Hold") {
          my $res = $ua->patch("http://$BOND_IP/v2/devices/$BOND_DEVICE{$shadeTarget}/state", Content => "{\"open\": $positionValue}");
          print "Shade update failed: " . $res->status_line . "\n" unless $res->is_success;
      }

      # If this shade is a component of a linked shade, check to see if we should update the linked shade.
      foreach my $linkedShade (keys %WMAP) {
        my @componentShades = @{$WMAP{$linkedShade}};
        my $linkedShadeStatus = -1;

        # We only want linked shades where we are a component.
        next unless grep({ $_ eq $shadeTarget } @componentShades);

        # Check all the component shades and see if they share the same status.
        foreach(@componentShades) {
          my $componentShadeStatus = getStatus($_);

          # First time through, we set the status to compare against.
          if($linkedShadeStatus == -1) {
            $linkedShadeStatus = $componentShadeStatus;
            next;
          }

          # We don't have a consistent state across our components. We're done here.
          if($componentShadeStatus != $linkedShadeStatus) {
            $linkedShadeStatus = -1;
            last;
          }
        }

        # No state updates required.
        next if $linkedShadeStatus == -1;

        # Update the linked shade.
        my $linkedState = $linkedShadeStatus == 100 ? 1 : 0;
        my $res = $ua->patch("http://$BOND_IP/v2/devices/$BOND_DEVICE{$linkedShade}/state", Content => "{\"open\": $linkedState}");
        print "Linked shade update failed: " . $res->status_line . "\n" unless $res->is_success;
      }
    } else {
      print "Command failed: " . $response->status_line . "\n" unless $response->is_success;
    }
  }

  # Return -1 on error.
  return -1 unless $moveResult;

  return 100 if (($moveDirection eq "Open") || ($moveDirection eq "Hold"));
  return 0 if $moveDirection eq "Close";
}
