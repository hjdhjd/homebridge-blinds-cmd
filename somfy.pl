#!/usr/bin/perl
#
# Example Somfy Control Script.
#
# This assumes that we are talking to a Somfy URTSI transmitter (https://www.somfysystems.com/products/1810872/universal-rts-interface)
# that is attached to an iTach Flex (https://www.globalcache.com/products/flex/) via serial.
# This enables access to multiple Somfy shades via Wi-Fi in a scriptable manner.
#
# URTSI channels allow you to control up to 8 shade systems:
#   1 - Shade or Shade Group A
#   2 - Shade or Shade Group B
#   3 - Shade or Shade Group C
#   4 - Shade or Shade Group D
#   5 - Shade or Shade Group E
#   6 - Shade or Shade Group F
#   7 - Shade or Shade Group G
#   8 - Shade or Shade Group H
#
# Example commands for your Homebridge config.json with homebridge-blinds-cmd:
# 
#   "up_cmd": "~/path/to/somfy.pl 3 up repeat",
#   "down_cmd": "~/path/to/somfy.pl 3 down repeat",
#   "state_cmd": "~/path/to/somfy.pl 3 status"
#

use strict;
use warnings;

use FindBin qw($Bin);
use Fcntl qw(:flock);
use Time::HiRes qw(usleep);
require LWP::UserAgent;

# The state file is used to store information about where we believe the shade's current state
# is. This is entirely based on the last command successfully issued, as Somfy does not have
# the ability to be queried on it's current state.
#
my $STATE = $Bin . '/somfy.state';

# The lock file is used as a concurrency control mechansim to ensure that this script is not
# being executed simultaneously.
#
my $LOCK = $Bin . '/somfy.lock';

# This specifies the number of times to repeat the signal transmission.
# Somfy shades can occasionally have trouble receiving a transmission. This
# ensures we repeat the intended instruction a few times for good measure.
#
my $REPEATCOUNT = 5;
my $USAGE = "Usage: $0 <channel> <up | down | stop | status> [repeat]\n";

# If you have multiple URTSIs in a home, for signal coverage reasons for instance, you can assign
# the individual channels to specific URTSIs. Otherwise, this should be the IP address of your
# iTach Flex attached to your URTSI.
#
my %SOMFY = (
  1 => 'YOUR.ITACH.FLEX.IP',
  2 => 'YOUR.ITACH.FLEX.IP',
  3 => 'YOUR.ITACH.FLEX.IP',
  4 => 'YOUR.ITACH.FLEX.IP',
  5 => 'YOUR.ITACH.FLEX.IP',
  6 => 'YOUR.ITACH.FLEX.IP',
  7 => 'YOUR.ITACH.FLEX.IP',
  8 => 'YOUR.ITACH.FLEX.IP'
);

# Window mapping so we understand groups of windows being controlled simultaneously.
# This is useful if you have a channel, say channel 4 in this instance, tied to controlling
# two individual shades (1 and 2 in the example below). Somfy allows for the notion of having
# an individual radio channel control multiple shades simultaneously, so that if you have
# say two individual motorized shades next to each other that you wish to simulteanously control
# you may do so.
#
my %WMAP = (
  4 => [ (1, 2) ],
  5 => [ (1, 2, 3, 4) ],
);

# Window state.
#
my %POS;

# Command line argument processing.
#
my $CHANNEL = shift or die $USAGE;

die $USAGE if $CHANNEL !~ /^\d+?$/ or $CHANNEL > 16;
die "Unable to determine which UTRSII to use for channel $CHANNEL\n" unless defined($SOMFY{$CHANNEL});

my $DIRECTION = shift or die $USAGE;

$DIRECTION = 'U' if $DIRECTION =~ /^up$/i;
$DIRECTION = 'D' if $DIRECTION =~ /^down$/i;
$DIRECTION = 'S' if $DIRECTION =~ /^stop$/i;
$DIRECTION = 'T' if $DIRECTION =~ /^status$/i;

$DIRECTION =~ /^[UDST]$/ or die $USAGE;

# See if we need to repeat this command a few times to ensure the signal gets through.
#
my $REPEAT = shift;

if(defined($REPEAT)) {
  if($REPEAT =~ /^repeat$/i) {
    $REPEAT = $REPEATCOUNT;
  } else {
    die $USAGE;
  }
} else {
  $REPEAT = 1;
}

# We need to be careful about concurrency. One signal per Somfy.
# Don't need to unlock this, as the lock will be released on exit.
#
if($DIRECTION ne 'T') {
  my $LOCKFILE;

  open($LOCKFILE, ">", $LOCK) or die "Unable to open $LOCK: $!\n";
  flock($LOCKFILE, LOCK_EX) or die "Unable to lock $LOCK: $!\n";
}

# Open the state file.
#
if(open(STATEFILE, $STATE)) {
  %POS = map {chomp; split ':', $_} <STATEFILE>;
  close(STATEFILE);
}

# Status only.
#
if($DIRECTION eq 'T') {

  if(!defined($POS{$CHANNEL})) {
    print "0\n";
  } else {
    print $POS{$CHANNEL}, "\n";
  }

  exit 0;
}

# Repeat the command as many times as requested, and only once otherwise.
#
for(; $REPEAT > 0; $REPEAT--) {

  # Create the request.
  #
  my $ua = LWP::UserAgent->new or die "Error creating a new UserAgent: $!\n";

  $ua->default_header("Content-Type" => "text/plain; charset=UTF-8");
  $ua->default_header("Content-Length" => "12");

  # Send Somfy shade control command in the following format:
  #
  # 01 (UTRSI address)
  # 05 (motor channel)
  # U/D/S (directional command)
  #
  my $cmd = '01' . sprintf("%02d", $CHANNEL) . "$DIRECTION\r\n";
  
  my $response = $ua->post("http://$SOMFY{$CHANNEL}/api/host/modules/1/ports/1/data", Content => $cmd);

  # Receive the response and check to see if there is an issue.
  #
  # print $response->is_success ? "Command successfully sent to Somfy.\n" : "Command failed: " . $response->status_line . "\n";
  print "Command failed: " . $response->status_line . "\n" unless $response->is_success;
  
  # Update the state file only if there's been successful movement.
  #
  if($response->is_success && $DIRECTION ne 'S') {
    my $pval = 0;
    
    $pval = 100 if $DIRECTION eq 'U';
    
    if($WMAP{$CHANNEL}) {
      my @arr = @{$WMAP{$CHANNEL}};
      foreach(@arr) {
        $POS{$_} = $pval;
      }
    }
  
    $POS{$CHANNEL} = $pval;
    
    if(open(STATEFILE, '>' . $STATE)) {
      foreach(keys %POS) {
        print STATEFILE "$_:$POS{$_}\n";
      }

      close(STATEFILE);
    }
  }

  # Briefly pause.
  #
  usleep(500000);
}
