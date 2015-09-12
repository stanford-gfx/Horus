import time
import os, sys, inspect
from pylab import *
import numpy
import scipy.interpolate
import requests

# DroneAPI:
from droneapi.lib import APIException, Vehicle, Attitude, Location, GPSInfo, VehicleMode, Mission, Parameters, Command, CommandSequence
from pymavlink import mavutil

# Spline and Curve utils
cmd_subfolder = os.path.realpath(os.path.abspath(os.path.join(os.path.split(inspect.getfile( inspect.currentframe() ))[0],"../HorusApp/app")))
if cmd_subfolder not in sys.path:
 sys.path.insert(0, cmd_subfolder)

import trajectoryAPI
import coord_system

UPDATE_IN_HZ = 1

class getHomePos(object):
  def __init__(self):

    self.current_location = None

    try:
      self.setup()
      self._loop()
    except APIException as e:
      print "API Failed:", e

  def sendHomeLocation(self, location):
    url = "http://localhost:5000/api/set_starting_pos"
    l = {'lat':location.lat, 'lng':location.lon}
    print "Sending", l
    r = requests.get(url, params=l)

  def setup(self):
    print "Creating splineFollow API..."
    self.api = local_connect()
    self.vehicle = self.api.get_vehicles()[0]

    if self.vehicle.mode.name == "INITIALIZING":
      print "Vehicle still booting, try again later"
      return
    
    
  def _loop(self):
    self.currentStartTime = time.time()
    while not self.api.exit:

      elapsedInState = time.time() - self.currentStartTime
      dt = 1.0 / UPDATE_IN_HZ


      home  = self.vehicle.location
      self.sendHomeLocation(home)
      time.sleep(dt)


print "Loading"
drone = getHomePos()



