import time
import os, sys, inspect
from pylab import *
import numpy
import scipy.interpolate

# DroneAPI:
from droneapi.lib import APIException, Vehicle, Attitude, Location, GPSInfo, VehicleMode, Mission, Parameters, Command, CommandSequence
from pymavlink import mavutil

# Spline and Curve utils
cmd_subfolder = os.path.realpath(os.path.abspath(os.path.join(os.path.split(inspect.getfile( inspect.currentframe() ))[0],"../HorusApp/app")))
if cmd_subfolder not in sys.path:
 sys.path.insert(0, cmd_subfolder)

import trajectoryAPI
import coord_system

# GLOBALS
UPDATE_IN_HZ = 5.0
TAKEOFF_HEIGHT = 60.0
DISTANCE_LIMIT_LOOK_AT_METERS = 1.0
DISTANCE_LIMIT_LOOK_FROM_METERS = 1.0

# # This assumes the easing curve knots are normalized in time and distance    
# P_lookFrom_spline = np.array([[37.42726916,-122.16675974,125.26796234],[37.42764561,-122.16647175,90.66962514],[37.42811446,-122.1661368,70.99576579],[37.42865668,-122.16803441,58.32427286]])
# T_lookFrom_spline = np.array([[0,0,0],[1,1,1],[2,2,2],[3,3,3]])
# P_lookFrom_ease   = np.array([[0.],[0.19466609],[0.43386089],[1.]])
# T_lookFrom_ease   = np.array([[0.],[0.19115073],[0.43763456],[1.]])

# # This assumes the easing curve knots are normalized in time and distance    
# P_lookAt_spline   = np.array([[37.42755791,-122.16697932,95.12572282],[37.42765371,-122.16689387,85.43055212],[37.42767449,-122.16689427,53.38133458],[37.42828712,-122.16673087,23.59932072]])
# T_lookAt_spline   = np.array([[0,0,0],[1,1,1],[2,2,2],[3,3,3]])
# P_lookAt_ease     = np.array([[0.],[0.14110407],[0.40892711],[1.]])
# T_lookAt_ease     = np.array([[0.],[0.19115073],[0.43763456],[1.]])

# lastTime = 44.00


# # This assumes the easing curve knots are normalized in time and distance    
# P_lookFrom_spline = np.array([[  37.42868841, -122.17132135,   94.37390925],[  37.42820394, -122.16854921,   94.37390925]])
# T_lookFrom_spline = np.array([[0, 0, 0],[1, 1, 1]])
# P_lookFrom_ease   = np.array([[0],[1]])
# T_lookFrom_ease   = np.array([[0],[1]])


# # This assumes the easing curve knots are normalized in time and distance    
# P_lookAt_spline   = np.array([[  37.42927347, -122.17117335,   24.38144348],[  37.42878924, -122.16840112,   24.35205332]])
# T_lookAt_spline   = np.array([[0, 0, 0],[1, 1, 1]])
# P_lookAt_ease     = np.array([[0], [0], [1], [1]])
# T_lookAt_ease     = np.array([[ 0.        ],[ 0.33269231], [ 0.68269231], [ 1.        ]])

# lastTime = 60.00

inFile = numpy.load("../HorusApp/shot-NJ_BioXEpic-1421715309019.npz")

P_lookFromNED_spline = inFile['P_lookFromNED_spline']
T_lookFromNED_spline = inFile['T_lookFromNED_spline'] 
P_lookFromNED_ease   = inFile['P_lookFromNED_ease'] 
T_lookFromNED_ease   = inFile['T_lookFromNED_ease'] 

# This assumes the easing curve knots are normalized in time and distance    
P_lookAtNED_spline   = inFile['P_lookAtNED_spline'] 
T_lookAtNED_spline   = inFile['T_lookAtNED_spline'] 
P_lookAtNED_ease     = inFile['P_lookAtNED_ease'] 
T_lookAtNED_ease     = inFile['T_lookAtNED_ease'] 

lastTime            = inFile['lastTime'][0]
startAltitude       = inFile['startAltitude'][0]
refLLH              = inFile['refLLH'][0]


print "###########################"
print "Loaded Spline Follower"
print "###########################"

print 'P_lookFromNED_spline\n', P_lookFromNED_spline
print 'T_lookFromNED_spline\n', T_lookFromNED_spline
print 'P_lookFromNED_ease  \n', P_lookFromNED_ease  
print 'T_lookFromNED_ease  \n', T_lookFromNED_ease  

# This assumes the eas\ning curve knots are normalized in time and distance    
print 'P_lookAtNED_spline\n', P_lookAtNED_spline
print 'T_lookAtNED_spline\n', T_lookAtNED_spline
print 'P_lookAtNED_ease  \n', P_lookAtNED_ease  
print 'T_lookAtNED_ease  \n', T_lookAtNED_ease  

print 'lastTime', lastTime
print 'startAltitude', startAltitude
print 'refLLH', refLLH


print "###########################"
# class DroneCommandInput(threading.Thread)
#   def __init__(self):
#     super(APIThread, self).__init__()
#     self.start()

#   def run():
#     return

class SplineFollowingDrone(object):
  def __init__(self):

    self.current_location = None
    
    # State Machine
    self.STATE = 'flyToStart'
    self.currentStateTime = time.time()
    self.states = {
      'waiting'   : self._state_waiting,
      'flyToStart': self._state_flyToStart,
      'flySpline' : self._state_flySpline,
    }
    self.altitudeOffset = 0

    self.lastLookFromPoint = None
    self.lastLookAtPoint = None

    try:
      self.setup()
      self.configureSpline()
      self.start()
      self._loop()
    except APIException as e:
      print "API Failed:", e

  def _stateTransition(self, newState):
    print "Switching from state %s to state %s" % (self.STATE, newState)
    self.currentStateTime = time.time()
    self.STATE = newState

  def setup(self):
    print "Creating splineFollow API..."
    self.api = local_connect()
    self.vehicle = self.api.get_vehicles()[0]

    if self.vehicle.mode.name == "INITIALIZING":
      print "Vehicle still booting, try again later"
      return

    printInfo(self.vehicle)
    
    #Register observers
    #self.vehicle.add_attribute_observer('armed', self.armed_callback)
    self.vehicle.add_attribute_observer('location', self.location_callback)
  
  def start(self):

    if not self.vehicle.armed:
      print "Arming..."
      self.vehicle.armed = True
      self.vehicle.flush()
      time.sleep(2)

      print "Changing to GUIDED mode"
      self.vehicle.mode = VehicleMode("GUIDED")
      self.vehicle.flush()
      time.sleep(2)

      TAKEOFF_HEIGHT = refLLH[2] - self.altitudeOffset

      print "Taking off to %s meters" % TAKEOFF_HEIGHT
      self.vehicle.commands.takeoff(TAKEOFF_HEIGHT)
      self.vehicle.flush()
      while self.vehicle.location.alt < TAKEOFF_HEIGHT-1:
        time.sleep(1)

    print "Changing to GUIDED mode"
    self.vehicle.mode = VehicleMode("GUIDED")
    self.vehicle.flush()
    time.sleep(2)

  def _loop(self):
    self.currentStartTime = time.time()
    while not self.api.exit:

      elapsedInState = time.time() - self.currentStateTime
      dt = 1.0 / UPDATE_IN_HZ

      if self.STATE != 'waiting':
        print "API running. Elapsed time in state \"%s\": %.2fs" % (self.STATE, elapsedInState)
      self.states[self.STATE](elapsedInState, dt)
      self.vehicle.flush()  

      time.sleep(dt)

  def _state_waiting(self, elapsed, dt):
    return

  def _state_flyToStart(self, elapsed, dt):
    l = self.vehicle.location
    if l is None:
      return
    lookFromStartLLH = coord_system.ned2llh(P_lookFromNED_spline[0], self.refLLH)
    lookAtStartLLH = coord_system.ned2llh(P_lookAtNED_spline[0], self.refLLH)

    lookFromStartLLH[2] = lookFromStartLLH[2] - self.altitudeOffset
    lookAtStartLLH[2] = lookFromStartLLH[2] - self.altitudeOffset
    
    distanceToStart = coord_system.get_distance_llh(lookFromStartLLH, numpy.array([l.lat,l.lon,l.alt]))
    print "Distance to start point: %.2fm" % distanceToStart
    if distanceToStart > 2.0 or np.linalg.norm(self.vehicle.velocity) > 0.5:
      self.sendLookFrom(lookFromStartLLH)
      self.sendLookAt(lookAtStartLLH)
    else:
      return self._stateTransition('flySpline')

  def _state_flySpline(self, elapsed, dt):
    if elapsed > lastTime:
      return self._stateTransition('waiting')

    t_lookAt   = self.time_to_lookAt(elapsed)
    t_lookFrom = self.time_to_lookFrom(elapsed)

    lookFromPointNED, TF, dTF = trajectoryAPI._evaluate_spatial_spline(self.C_lookFrom_spline,self.T_lookFrom_spline,self.sd_lookFrom_spline,T_eval=np.array([[t_lookFrom,t_lookFrom,t_lookFrom]]))
    lookAtPointNED, TA, dTA = trajectoryAPI._evaluate_spatial_spline(self.C_lookAt_spline,self.T_lookAt_spline,self.sd_lookAt_spline,T_eval=np.array([[t_lookAt,t_lookAt,t_lookAt]]))

    lookFromPoint = coord_system.ned2llh(lookFromPointNED[0], self.refLLH)
    lookAtPoint   = coord_system.ned2llh(lookAtPointNED[0], self.refLLH)
    lookFromPoint[2] = lookFromPoint[2] - self.altitudeOffset
    lookAtPoint[2] = lookAtPoint[2] - self.altitudeOffset

    self.sendLookFrom(lookFromPoint)
    
    if self.lastLookAtPoint == None or coord_system.get_distance_llh(self.lastLookAtPoint, lookAtPoint) > DISTANCE_LIMIT_LOOK_AT_METERS: 
      self.lastLookAtPoint = lookAtPoint
      self.sendLookAt(lookAtPoint)

  def location_callback(location):
    self.current_location = location

  def armed_callback(self, armed):
    print "Drone Armed Callback: %s" % armed

  def configureSpline(self):
    C_lookFromNED_spline, T_lookFrom2_spline, sd_lF = trajectoryAPI._get_spatial_spline_coefficients(P_lookFromNED_spline, T_lookFromNED_spline)
    C_lookAtNED_spline,   T_lookAt2_spline,   sd_lA = trajectoryAPI._get_spatial_spline_coefficients(P_lookAtNED_spline,   T_lookAtNED_spline)

    # This assumes the easing curve knots are normalized in time and distance    
    T_linspace_norm_lookAt,     T_user_progress_lookAt,   P_user_progress_lookAt,  ref_llh1 = trajectoryAPI.reparameterize_spline(P_lookAtNED_spline,   T_lookAtNED_spline,   P_lookAtNED_ease,   T_lookAtNED_ease)
    T_linspace_norm_cameraPose, T_user_progress_lookFrom, P_user_progress_lookFrom, ref_llh2 = trajectoryAPI.reparameterize_spline(P_lookFromNED_spline, T_lookFromNED_spline, P_lookFromNED_ease, T_lookFromNED_ease)

    timeMaxT     = lastTime
    lookAtMaxT   = T_lookAtNED_spline[-1][0]
    lookFromMaxT = T_lookFromNED_spline[-1][0]

    self.refLLH = refLLH
    self.altitudeOffset = startAltitude

    self.C_lookFrom_spline  = C_lookFromNED_spline
    self.T_lookFrom_spline  = T_lookFromNED_spline
    self.sd_lookFrom_spline = sd_lF

    self.C_lookAt_spline  = C_lookAtNED_spline
    self.T_lookAt_spline  = T_lookAtNED_spline
    self.sd_lookAt_spline = sd_lA

    # Scale up the relevant parts
    self.reparameterizedTime        =   T_linspace_norm_lookAt * timeMaxT       #This is the progression of time, which is uniform
    self.lookAtReparameterizedT     =   T_user_progress_lookAt * lookAtMaxT     #This is the spline parameter along lookAt
    self.lookFromReparameterizedT   =   T_user_progress_lookFrom * lookFromMaxT #This is the spline parameter along lookFrom 

    # Set up interpolation functions
    self.time_to_lookFrom = scipy.interpolate.interp1d(self.reparameterizedTime,self.lookFromReparameterizedT)
    self.time_to_lookAt   = scipy.interpolate.interp1d(self.reparameterizedTime,self.lookAtReparameterizedT)


  def sendLookAt(self, llh):
    msg = self.vehicle.message_factory.command_long_encode(
                                                    1, 1,    # target system, target component
                                                    mavutil.mavlink.MAV_CMD_DO_SET_ROI, #command
                                                    0, #confirmation
                                                    0, 0, 0, 0, #params 1-4
                                                    llh[0],
                                                    llh[1],
                                                    llh[2]
                                                    )

    self.vehicle.send_mavlink(msg)

  def sendLookFrom(self, llh):
    dest = Location(llh[0],llh[1],llh[2],is_relative=False)
    self.vehicle.commands.goto(dest)


#
# END OF DRONE CLASS
#

def printInfo(vehicle):
  print "Mode: %s" % vehicle.mode
  print "Location: %s" % vehicle.location
  print "Attitude: %s" % vehicle.attitude
  print "Velocity: %s" % vehicle.velocity
  print "GPS: %s" % vehicle.gps_0
  print "Armed: %s" % vehicle.armed
  print "groundspeed: %s" % vehicle.groundspeed
  print "airspeed: %s" % vehicle.airspeed


print "Loading"
drone = SplineFollowingDrone()



