import time
import os, sys, inspect
from pylab import *
import numpy
import scipy.interpolate
import requests
import simplejson
import cgi

# SHUT UP REQUESTS!!!
import logging
logging.getLogger("requests").setLevel(logging.WARNING)

#from enum import Enum
from Queue import Queue

from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
from SocketServer import ThreadingMixIn
import threading

# DroneAPI:
from droneapi.lib import APIException, Vehicle, Attitude, Location, GPSInfo, VehicleMode, Mission, Parameters, Command, CommandSequence
from pymavlink import mavutil

# Spline and Curve utils
cmd_subfolder = os.path.realpath(os.path.abspath(os.path.join(os.path.split(inspect.getfile( inspect.currentframe() ))[0],"../HorusApp/app")))
if cmd_subfolder not in sys.path:
 sys.path.insert(0, cmd_subfolder)

import trajectoryAPI
import coord_system

#DroneAPILink
curr_folder = os.path.realpath(os.path.abspath(os.path.join(os.path.split(inspect.getfile( inspect.currentframe() ))[0],".")))
if curr_folder not in sys.path:
 sys.path.insert(0, curr_folder)

import splineFollowingUtility 

UPDATE_IN_HZ = 5 #  what is this? crosscheck files for loops

class DroneState:
    Waiting = 1
    StartingSpline = 2
    FollowingSpline = 3

actionQueue = Queue(maxsize = 0)

class droneLink(object):
  def __init__(self):
    self.current_location = None
    self.droneState = DroneState.Waiting
    self.updateState = {  DroneState.Waiting: self.updateWaiting,
                          DroneState.StartingSpline: self.updateStartingSpline,
                          DroneState.FollowingSpline: self.updateFollowingSpline,

    }
    self.STATE = 'waiting'
    self.currentStateTime = time.time()
    try:
      self.setup()   
      splineFollowingUtility.init_splinefollow(self)
    except APIException as e:
      print "API Failed:", e

  def sendLocation(self):
    location  = self.vehicle.location
    url = "http://localhost:5000/api/set_vehicle_location"
    l = {'lat':location.lat, 'lng':location.lon, 'mode':self.vehicle.mode.name, 'armed':self.vehicle.armed}
    r = requests.get(url, params=l)

  def sendElapsedTime(self):
    elapsed = 0
    if self.STATE == 'flySpline':
      elapsed = time.time() - self.currentStateTime

    url = "http://localhost:5000/api/set_elapsed_time"
    t = {'elapsed': elapsed}
    r = requests.get(url, params=t)

  #good to go
  def setup(self):
    print "Creating splineFollow API..."
    self.api = local_connect()
    self.vehicle = self.api.get_vehicles()[0]

    if self.vehicle.mode.name == "INITIALIZING":
      print "Vehicle still booting, try again later"
      return

  def updateWaiting(self, elapsed, dt, data = None):
    if data is not None and data['command'] == "flyNewSpline":
      splineFollowingUtility.newTrajectory(self, data)
      self.droneState = DroneState.StartingSpline


  def updateStartingSpline(self, elapsed, dt, data = None): 
    if (data is not None):
      if (data['command'] == "flyNewSpline"):
        splineFollowingUtility.newTrajectory(self, data)
        self.droneState = DroneState.StartingSpline
      elif (data['command'] == "modifyCurrentSpline"):
        splineFollowingUtility.changeCurrentTrajectory(self, data)
    else:
      splineFollowingUtility.start(self)
      self.droneState = DroneState.FollowingSpline

  def updateFollowingSpline(self, elapsed, dt, data = None):
    if (data is not None):
      if (self.STATE == 'flyToStart' or data['command'] == "flyNewSpline"):
        splineFollowingUtility.newTrajectory(self, data)
        self.droneState = DroneState.StartingSpline
      elif (data['command'] == "modifyCurrentSpline"):
        splineFollowingUtility.changeCurrentTrajectory(self, data)
    else:
      if self.STATE != 'waiting':
        print "API running. Elapsed time in state \"%s\": %.2fs" % (self.STATE, elapsed)
      self.states[self.STATE](self, elapsed, dt)
      self.vehicle.flush()

  def flightFinished(self):
    self.droneState = DroneState.Waiting

  def location_callback(self, location):
    self.current_location = location

  def _loop(self):
    count = 0
    while not self.api.exit:
      elapsedInState = time.time() - self.currentStateTime
      dt = 1.0 / UPDATE_IN_HZ
      
      count += 1
      if count == UPDATE_IN_HZ:
        count = 0
        self.sendLocation()

      if not actionQueue.empty():
        data = actionQueue.get()
        self.updateState[self.droneState](elapsed=elapsedInState, dt=dt, data=data)
        actionQueue.task_done()
      else:
        self.updateState[self.droneState](elapsed=elapsedInState, dt=dt)

      time.sleep(dt)

drone_ = droneLink()
HOST_NAME = 'localhost' # Change this for different hosts
PORT_NUMBER = 9000 

class MyHandler(BaseHTTPRequestHandler):
  def do_HEAD(s):
    s.send_response(200)
    s.send_header("Content-type", "text/html")
    s.end_headers()
  
  def do_GET(self):
    print "GET REQUEST"
    drone_.sendLocation()

  def do_POST(self):
    self.data_string = self.rfile.read(int(self.headers['Content-Length']))
    print self.data_string
    self.send_response(200)
    self.end_headers()

    data = simplejson.loads(self.data_string)
    actionQueue.put(data)

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in a separate thread."""

server_class = ThreadedHTTPServer
httpd = server_class((HOST_NAME, PORT_NUMBER), MyHandler)
print time.asctime(), "Server Starts - %s:%s" % (HOST_NAME, PORT_NUMBER)         
try:
  th = threading.Thread(target=httpd.serve_forever)
  th.daemon = True
  th.start()
  
  drone_._loop()
except KeyboardInterrupt:
  httpd.server_close()