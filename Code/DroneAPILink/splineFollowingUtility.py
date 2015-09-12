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

#GLOBALS
TAKEOFF_HEIGHT = 60.0
DISTANCE_LIMIT_LOOK_AT_METERS = 1.0
DISTANCE_LIMIT_LOOK_FROM_METERS = 1.0

def init_splinefollow(drone):
  drone.states = {
    'waiting'   : _state_waiting, 
    'flyToStart': _state_flyToStart, 
    'flySpline' : _state_flySpline, 
  }
  drone.lastLookFromPoint = None
  drone.lastLookAtPoint = None
  drone.altitudeOffset = 0
  drone.current_location = None
  drone.vehicle.add_attribute_observer('location', drone.location_callback)

def setSpline(drone, data):
  lookAtN   = data['lookAtN']
  lookAtE   = data['lookAtE']
  lookAtD   = data['lookAtD']
  lookFromN = data['lookFromN']
  lookFromE = data['lookFromE']
  lookFromD = data['lookFromD']

  drone.P_lookFromNED_spline      = c_[lookFromN, lookFromE, lookFromD]
  drone.T_lookFromNED_spline      = c_[data['lookFromT'], data['lookFromT'], data['lookFromT']]
  drone.P_lookFromNED_ease        = c_[array(data['lookFromEasingD'])]
  drone.T_lookFromNED_ease        = c_[array(data['lookFromEasingT'])]

  drone.P_lookAtNED_spline        = c_[lookAtN, lookAtE, lookAtD]
  drone.T_lookAtNED_spline        = c_[data['lookAtT'], data['lookAtT'], data['lookAtT']]
  drone.P_lookAtNED_ease          = c_[array(data['lookAtEasingD'])]
  drone.T_lookAtNED_ease          = c_[array(data['lookAtEasingT'])] 

  drone.startAltitude = data['startAltitude']
  drone.lastTime      = data['lastTime'];
  drone.refLLH        = array([data['refLLH']['lat'], data['refLLH']['lng'], data['refLLH']['altitude']])


def newTrajectory(drone, data): 
  setSpline(drone, data)
  drone.lastLookFromPoint = None
  drone.lastLookAtPoint = None
  drone.altitudeOffset = 0
  drone.vehicle.add_attribute_observer('location', drone.location_callback)
  configureSpline(drone)

def changeCurrentTrajectory(drone, data): 
  setSpline(drone, data)
  configureSpline(drone)

def _stateTransition(drone, newState):
    print "Switching from state %s to state %s" % (drone.STATE, newState)
    drone.currentStateTime = time.time()
    drone.STATE = newState

def start(drone): 
  if not drone.vehicle.armed:
    print "Arming..."
    drone.vehicle.armed = True
    drone.vehicle.flush()
    time.sleep(2)

    print "Changing to GUIDED mode"
    drone.vehicle.mode = VehicleMode("GUIDED")
    drone.vehicle.flush()
    time.sleep(2)

    TAKEOFF_HEIGHT = drone.refLLH[2] - drone.altitudeOffset

    print "Taking off to %s meters" % TAKEOFF_HEIGHT
    drone.vehicle.commands.takeoff(TAKEOFF_HEIGHT)
    drone.vehicle.flush()
    while drone.vehicle.location.alt < TAKEOFF_HEIGHT-1:
      time.sleep(1)

  print "Changing to GUIDED mode"
  drone.vehicle.mode = VehicleMode("GUIDED")
  drone.vehicle.flush()
  time.sleep(2)
  _stateTransition(drone, 'flyToStart')

def _state_waiting(drone, elapsed, dt):
    drone.flightFinished() 
    return

def _state_flyToStart(drone, elapsed, dt):
  l = drone.vehicle.location
  if l is None:
    return
  lookFromStartLLH = coord_system.ned2llh(drone.P_lookFromNED_spline[0], drone.refLLH)
  lookAtStartLLH = coord_system.ned2llh(drone.P_lookAtNED_spline[0], drone.refLLH)

  lookFromStartLLH[2] = lookFromStartLLH[2] - drone.altitudeOffset
  lookAtStartLLH[2] = lookFromStartLLH[2] - drone.altitudeOffset
  
  distanceToStart = coord_system.get_distance_llh(lookFromStartLLH, numpy.array([l.lat,l.lon,l.alt]))
  print "Distance to start point: %.2fm" % distanceToStart
  if distanceToStart > 2.0 or np.linalg.norm(drone.vehicle.velocity) > 0.5:
    sendLookFrom(drone, lookFromStartLLH)
    sendLookAt(drone, lookAtStartLLH)
  else:
    return _stateTransition(drone, 'flySpline')

def _state_flySpline(drone, elapsed, dt): 
  if elapsed > drone.lastTime:
    return _stateTransition(drone, 'waiting') 

  t_lookAt   = drone.time_to_lookAt(elapsed)
  t_lookFrom = drone.time_to_lookFrom(elapsed)

  lookFromPointNED, TF, dTF = trajectoryAPI._evaluate_spatial_spline(drone.C_lookFrom_spline,drone.T_lookFrom_spline,drone.sd_lookFrom_spline,T_eval=np.array([[t_lookFrom,t_lookFrom,t_lookFrom]]))
  lookAtPointNED, TA, dTA = trajectoryAPI._evaluate_spatial_spline(drone.C_lookAt_spline,drone.T_lookAt_spline,drone.sd_lookAt_spline,T_eval=np.array([[t_lookAt,t_lookAt,t_lookAt]]))

  lookFromPoint = coord_system.ned2llh(lookFromPointNED[0], drone.refLLH)
  lookAtPoint   = coord_system.ned2llh(lookAtPointNED[0], drone.refLLH)
  lookFromPoint[2] = lookFromPoint[2] - drone.altitudeOffset
  lookAtPoint[2] = lookAtPoint[2] - drone.altitudeOffset

  sendLookFrom(drone, lookFromPoint)
  
  if drone.lastLookAtPoint == None or coord_system.get_distance_llh(drone.lastLookAtPoint, lookAtPoint) > DISTANCE_LIMIT_LOOK_AT_METERS: 
    drone.lastLookAtPoint = lookAtPoint
    sendLookAt(drone, lookAtPoint)

def armed_callback(drone, armed):
  print "Drone Armed Callback: %s" % armed

def configureSpline(drone):
  C_lookFromNED_spline, T_lookFrom2_spline, sd_lF = trajectoryAPI._get_spatial_spline_coefficients(drone.P_lookFromNED_spline, drone.T_lookFromNED_spline)
  C_lookAtNED_spline,   T_lookAt2_spline,   sd_lA = trajectoryAPI._get_spatial_spline_coefficients(drone.P_lookAtNED_spline,   drone.T_lookAtNED_spline)

  # This assumes the easing curve knots are normalized in time and distance    
  T_linspace_norm_lookAt,     T_user_progress_lookAt,   P_user_progress_lookAt,  ref_llh1 = trajectoryAPI.reparameterize_spline(drone.P_lookAtNED_spline,   drone.T_lookAtNED_spline,   drone.P_lookAtNED_ease,   drone.T_lookAtNED_ease)
  T_linspace_norm_cameraPose, T_user_progress_lookFrom, P_user_progress_lookFrom, ref_llh2 = trajectoryAPI.reparameterize_spline(drone.P_lookFromNED_spline, drone.T_lookFromNED_spline, drone.P_lookFromNED_ease, drone.T_lookFromNED_ease)

  timeMaxT     = drone.lastTime
  lookAtMaxT   = drone.T_lookAtNED_spline[-1][0]
  lookFromMaxT = drone.T_lookFromNED_spline[-1][0]

  drone.altitudeOffset = drone.startAltitude 

  drone.C_lookFrom_spline  = C_lookFromNED_spline
  drone.T_lookFrom_spline  = drone.T_lookFromNED_spline
  drone.sd_lookFrom_spline = sd_lF

  drone.C_lookAt_spline  = C_lookAtNED_spline
  drone.T_lookAt_spline  = drone.T_lookAtNED_spline
  drone.sd_lookAt_spline = sd_lA

  # Scale up the relevant parts
  drone.reparameterizedTime        =   T_linspace_norm_lookAt * timeMaxT       #This is the progression of time, which is uniform
  drone.lookAtReparameterizedT     =   T_user_progress_lookAt * lookAtMaxT     #This is the spline parameter along lookAt
  drone.lookFromReparameterizedT   =   T_user_progress_lookFrom * lookFromMaxT #This is the spline parameter along lookFrom 

  # Set up interpolation functions
  drone.time_to_lookFrom = scipy.interpolate.interp1d(drone.reparameterizedTime,drone.lookFromReparameterizedT)
  drone.time_to_lookAt   = scipy.interpolate.interp1d(drone.reparameterizedTime,drone.lookAtReparameterizedT)


def sendLookAt(drone, llh, vel=[0,0,0]):
  msg = drone.vehicle.message_factory.command_long_encode(
                                                  1, 1,    # target system, target component
                                                  mavutil.mavlink.MAV_CMD_DO_SET_ROI, #command
                                                  0, #confirmation
                                                  0, 0, 0, 0, #params 1-4
                                                  llh[0],
                                                  llh[1],
                                                  llh[2]
                                                  )

  drone.vehicle.send_mavlink(msg)

#LLH in lat, lon, relative alt. velocity in NED meters per second
def sendLookFrom(drone, llh, vel=[0,0,0]):
  print "sending look from"
  dest = Location(llh[0],llh[1],llh[2],is_relative=False)
  drone.vehicle.commands.goto(dest)
  # msg = drone.vehicle.message_factory.set_position_target_global_int_encode(
  #           0,  # system time in ms
  #           1,  # target system
  #           0,  # target component
  #           mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
  #           448, # ignore accel, take vel and pos
  #           int(llh[0] * 1e7),
  #           int(llh[1] * 1e7),
  #           llh[2],
  #           vel[0], vel[1], vel[2], # velocity
  #           0, 0, 0, # accel x,y,z
  #           0, 0) # yaw, yaw rate

  # drone.vehicle.send_mavlink(msg)


