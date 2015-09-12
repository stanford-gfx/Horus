from app import server, db, trajectoryAPI
from pylab import *
import flask
from flask import jsonify, request, url_for, redirect, render_template, abort
from flask.ext import restful
import requests
import math, time
import urllib2
import json
import os
from os import path
 
starting_lat = 0
starting_lng = 0
vehicle_millis = 0
current_lat = 0
current_lng = 0
armed = False
mode = "NOT CONNECTED"
real_elapsed_time = -1
TIMEOUT_MILLIS = 5000

# TEMPLATED HTML ROUTE
@server.route('/')
@server.route('/index')
def index():
  shots = db.get_shots()
  return render_template('index.html', shots=shots)

# TEMPLATED HTML ROUTE
@server.route('/easing_curve')
def easing_curve():
  shots = db.get_shots()
  return render_template('easing_curve.html', shots=shots)

# TEXT ROUTE
@server.route('/edit_shot')
def edit_shot():
  return render_template('edit_shot.html')


@server.route('/api/get_keyframes.json', methods = ['POST'])
def get_keyframes():
  print request.get_json()
  return jsonify(request.json)


# Save a shot
@server.route('/api/set_shot', methods = ['POST'])
def set_shot():
  parsed_json = request.get_json()
  data = request.data

  shotname = parsed_json['shotName']
  db.set_shot(shotname, data)

  return jsonify({
    'test':1
    })

# Load a shot
@server.route('/api/get_shot', methods = ['GET'])
def get_shot():
  shotname = request.args.get('shot')
  rev = request.args.get('rev')

  if not shotname:
    return abort(404)

  data = None
  revCount = 1
  if rev:
    data, revCount = db.get_shot(shotname, int(rev))
  else:
    data, revCount = db.get_shot(shotname)

  if data:
    return flask.Response(response = data,
      status=200,
      mimetype="application/json")

  else:
    abort(404)

# checks if name is unique
@server.route('/api/is_name_available', methods = ['GET'])
def is_name_available():
  shotname = request.args.get('name')
  valid = not db.shot_exists(shotname)

  print("shotname: " + shotname + " is free? : %s" % (valid))
  data = jsonify({"valid": valid})
  return data


@server.route('/api/get_log', methods = ['GET'])
def get_log():
  shotname = request.args.get('shot')

  if not shotname:
    return abort(404)

  data = db.get_log(shotname)

  if data:
    return jsonify(data)

  else:
    abort(404)

@server.route('/api/get_easing_curve', methods = ['POST'])
def get_easing_curve():
  js = request.get_json()
  tvals = array(js['t'])
  dlist = array(js['d'])
  
  P = c_[dlist]
  T = c_[tvals]
  
  C,T,sd = trajectoryAPI.compute_easing_curve(P, T)
  data = {
    'C':C.tolist(),
    'T':T.tolist(),
  }

  return jsonify(data)

# Get a spline
@server.route('/api/get_spline', methods = ['POST'])
def get_spline():
  parsed_json = request.get_json()
  #data = request.data
  #camera lla, lookat lla
  cameraPose_lat_list = parsed_json['cameraPoseLats']
  cameraPose_lng_list = parsed_json['cameraPoseLngs']
  cameraPose_alt_list = parsed_json['cameraPoseAlts']
  lookAt_lat_list = parsed_json['lookAtLats']
  lookAt_lng_list = parsed_json['lookAtLngs']
  lookAt_alt_list = parsed_json['lookAtAlts']
  P_cameraPose = c_[cameraPose_lat_list, cameraPose_lng_list, cameraPose_alt_list]
  C_cameraPose,T_cameraPose,sd_cameraPose,dist_cameraPose = trajectoryAPI.compute_spatial_trajectory_and_arc_distance(P_cameraPose, inNED=False)
  
  P_lookAt = c_[lookAt_lat_list, lookAt_lng_list, lookAt_alt_list]
  C_lookAt,T_lookAt,sd_lookAt,dist_lookAt = trajectoryAPI.compute_spatial_trajectory_and_arc_distance(P_lookAt, inNED=False)
  #P_eval, T_eval, dT = splineutils.evaluate_catmull_rom_spline(C, T, sd, num_samples=200);
  data = {
    'cameraPoseCoeff': C_cameraPose.tolist(),
    'cameraPoseTvals': T_cameraPose.tolist(),
    'cameraPoseDist' : dist_cameraPose.tolist(),
    'lookAtCoeff': C_lookAt.tolist(),
    'lookAtTvals': T_lookAt.tolist(),
    'lookAtDist' : dist_lookAt.tolist()
  }

  return jsonify(data)

# Get a spline
@server.route('/api/get_spline_ned', methods = ['POST'])
def get_spline_ned():
  js = request.get_json()
  lookAtN   = js['lookAtN']
  lookAtE   = js['lookAtE']
  lookAtD   = js['lookAtD']
  lookFromN = js['lookFromN']
  lookFromE = js['lookFromE']
  lookFromD = js['lookFromD']

  P_lookFromNED = c_[lookFromN, lookFromE, lookFromD]
  C_lookFromNED,T_lookFromNED,sd_lookFromNED,dist_lookFromNED = trajectoryAPI.compute_spatial_trajectory_and_arc_distance(P_lookFromNED)

  P_lookAtNED = c_[lookAtN, lookAtE, lookAtD]
  C_lookAtNED,T_lookAtNED,sd_lookAtNED,dist_lookAtNED = trajectoryAPI.compute_spatial_trajectory_and_arc_distance(P_lookAtNED)

  data = {
    'C_lookFromNED':     C_lookFromNED.tolist(),
    'T_lookFromNED':     T_lookFromNED.tolist(),
    'dist_lookFromNED':  dist_lookFromNED.tolist(),
    'C_lookAtNED':       C_lookAtNED.tolist(),
    'T_lookAtNED':       T_lookAtNED.tolist(),
    'dist_lookAtNED':    dist_lookAtNED.tolist()
  }

  return jsonify(data)

@server.route('/api/reparameterize_spline_ned', methods = ['POST'])
def reparameterize_spline_ned():
  js = request.get_json()
  lookAtN   = js['lookAtN']
  lookAtE   = js['lookAtE']
  lookAtD   = js['lookAtD']
  lookFromN = js['lookFromN']
  lookFromE = js['lookFromE']
  lookFromD = js['lookFromD']

  P_lookFromNED      = c_[lookFromN, lookFromE, lookFromD]
  T_lookFromNED      = c_[js['lookFromT'], js['lookFromT'], js['lookFromT']]
  P_easingLookFrom = c_[array(js['lookFromEasingD'])]
  T_easingLookFrom = c_[array(js['lookFromEasingT'])]

  P_lookAtNED    = c_[lookAtN, lookAtE, lookAtD]
  T_lookAtNED    = c_[js['lookAtT'], js['lookAtT'], js['lookAtT']]
  P_easingLookAt = c_[array(js['lookAtEasingD'])]
  T_easingLookAt = c_[array(js['lookAtEasingT'])]  

  T_linspace_norm_lookAt, T_user_progress_lookAt, P_user_progress_lookAt, ref_llh_lookAt = trajectoryAPI.reparameterize_spline(P_lookAtNED, T_lookAtNED, P_easingLookAt, T_easingLookAt)
  T_linspace_norm_cameraPose, T_user_progress_lookFrom, P_user_progress_lookFrom, ref_llh_lookFrom = trajectoryAPI.reparameterize_spline(P_lookFromNED, T_lookFromNED, P_easingLookFrom, T_easingLookFrom)

  data = {
    'lookAtReparameterizedT': T_user_progress_lookAt.tolist(), 
    'reparameterizedTime': T_linspace_norm_lookAt.tolist(),
    'lookFromReparameterizedT': T_user_progress_lookFrom.tolist(),
  }

  return jsonify(data)

@server.route('/api/reparameterize_spline', methods = ['POST'])
def reparameterize_spline():
  js = request.get_json()
  cameraPose_lat_list = js['cameraPoseLats']
  cameraPose_lng_list = js['cameraPoseLngs']
  cameraPose_alt_list = js['cameraPoseAlts']
  lookAt_lat_list = js['lookAtLats']
  lookAt_lng_list = js['lookAtLngs']
  lookAt_alt_list = js['lookAtAlts']

  T_cameraPose = c_[js['cameraPoseTvals'], js['cameraPoseTvals'], js['cameraPoseTvals']]
  T_lookAt = c_[js['lookAtTvals'], js['lookAtTvals'], js['lookAtTvals']]

  lookAt_easing_tvals = array(js['lookAtEasingT'])
  lookAt_easing_dlist = array(js['lookAtEasingD'])
  cameraPose_easing_tvals = array(js['cameraPoseEasingT'])
  cameraPose_easing_dlist = array(js['cameraPoseEasingD'])

  P_easingCameraPose = c_[cameraPose_easing_dlist]
  T_easingCameraPose = c_[cameraPose_easing_tvals]

  P_easingLookAt = c_[lookAt_easing_dlist]
  T_easingLookAt = c_[lookAt_easing_tvals]  

  P_cameraPose = c_[cameraPose_lat_list, cameraPose_lng_list, cameraPose_alt_list]

  P_lookAt = c_[lookAt_lat_list, lookAt_lng_list, lookAt_alt_list]

  T_linspace_norm_lookAt, T_user_progress_lookAt, P_user_progress_lookAt, ref_llh_lookAt = trajectoryAPI.reparameterize_spline(P_lookAt, T_lookAt, P_easingLookAt, T_easingLookAt)
  T_linspace_norm_cameraPose, T_user_progress_lookFrom, P_user_progress_lookFrom, ref_llh_lookFrom = trajectoryAPI.reparameterize_spline(P_cameraPose, T_cameraPose, P_easingCameraPose, T_easingCameraPose)

  data = {
    'lookAtReparameterizedT': T_user_progress_lookAt.tolist(), 
    'reparameterizedTime': T_linspace_norm_lookAt.tolist(),
    'lookFromReparameterizedT': T_user_progress_lookFrom.tolist(),
  }

  return jsonify(data)

@server.route('/api/export_spline_to_quad_representation_ned', methods = ['POST'])
def export_spline_to_quad_representation_ned():
  #which one is getting fvalled? FIGURE OUT WHAT'S GOING ON HERE

  shot = request.args.get('shot', 0)
  if not shot:
    return

  js = request.get_json()

  lookAtN   = js['lookAtN']
  lookAtE   = js['lookAtE']
  lookAtD   = js['lookAtD']
  lookFromN = js['lookFromN']
  lookFromE = js['lookFromE']
  lookFromD = js['lookFromD']

  # Exported Values

  P_lookFromNED_spline      = c_[lookFromN, lookFromE, lookFromD]
  T_lookFromNED_spline      = c_[js['lookFromT'], js['lookFromT'], js['lookFromT']]
  P_lookFromNED_ease        = c_[array(js['lookFromEasingD'])]
  T_lookFromNED_ease        = c_[array(js['lookFromEasingT'])]

  P_lookAtNED_spline        = c_[lookAtN, lookAtE, lookAtD]
  T_lookAtNED_spline        = c_[js['lookAtT'], js['lookAtT'], js['lookAtT']]
  P_lookAtNED_ease          = c_[array(js['lookAtEasingD'])]
  T_lookAtNED_ease          = c_[array(js['lookAtEasingT'])]  

  startAltitude = js['startAltitude']
  lastTime      = js['lastTime'];
  rev           = js['rev'];

  refLLH        = array([js['refLLH']['lat'], js['refLLH']['lng'], js['refLLH']['altitude']])

  P = np.array([
    P_lookFromNED_spline,
    T_lookFromNED_spline,
    P_lookFromNED_ease,
    T_lookFromNED_ease,
    P_lookAtNED_spline,
    T_lookAtNED_spline,
    P_lookAtNED_ease,
    T_lookAtNED_ease,
    [lastTime],
    [startAltitude],
    [refLLH]
    ])

  # First Save, for later analysis!!!
  millis = int(round(time.time() * 1000))
  np.savez(("shot-%s-rev%s-%d" % (shot, rev, millis)), 
    P_lookFromNED_spline=P_lookFromNED_spline,
    T_lookFromNED_spline=T_lookFromNED_spline,
    P_lookFromNED_ease=P_lookFromNED_ease,
    T_lookFromNED_ease=T_lookFromNED_ease,
    P_lookAtNED_spline=P_lookAtNED_spline,
    T_lookAtNED_spline=T_lookAtNED_spline,
    P_lookAtNED_ease=P_lookAtNED_ease,
    T_lookAtNED_ease=T_lookAtNED_ease,
    lastTime=[lastTime],
    startAltitude=[startAltitude],
    refLLH=[refLLH])

  export_data = {
    "command" : js['command'],
    "P_lookFromNED_spline": P_lookFromNED_spline.tolist(),
    "T_lookFromNED_spline": T_lookFromNED_spline.tolist(),
    "P_lookFromNED_ease": P_lookFromNED_ease.tolist(),
    "T_lookFromNED_ease": T_lookFromNED_ease.tolist(),
    "P_lookAtNED_spline": P_lookAtNED_spline.tolist(),
    "T_lookAtNED_spline": T_lookAtNED_spline.tolist(),
    "P_lookAtNED_ease": P_lookAtNED_ease.tolist(),
    "T_lookAtNED_ease": T_lookAtNED_ease.tolist(),
    "lastTime": [lastTime],
    "startAltitude": [startAltitude],
    "refLLH": c_[refLLH].tolist()
  }

  req = urllib2.Request("http://localhost:9000", json.dumps(js), {'Content-Type': 'application/json'})
  f = urllib2.urlopen(req)
  res = f.read()
  f.close()

  return jsonify({'result':'ok'})

@server.route('/api/export_spline_to_quad_representation', methods = ['POST'])
def export_spline_to_quad_representation():
  js = request.get_json()
  cameraPose_lat_list = js['cameraPoseLats']
  cameraPose_lng_list = js['cameraPoseLngs']
  cameraPose_alt_list = js['cameraPoseAlts']
  lookAt_lat_list = js['lookAtLats']
  lookAt_lng_list = js['lookAtLngs']
  lookAt_alt_list = js['lookAtAlts']

  lookAt_easing_tvals = array(js['lookAtEasingT'])
  lookAt_easing_dlist = array(js['lookAtEasingD'])
  cameraPose_easing_tvals = array(js['cameraPoseEasingT'])
  cameraPose_easing_dlist = array(js['cameraPoseEasingD'])

  # Exported Values

  P_lookFrom_spline = c_[cameraPose_lat_list, cameraPose_lng_list, cameraPose_alt_list]
  T_lookFrom_spline = c_[js['cameraPoseTvals'], js['cameraPoseTvals'], js['cameraPoseTvals']]
  P_lookFrom_ease = c_[cameraPose_easing_dlist]
  T_lookFrom_ease = c_[cameraPose_easing_tvals]

  P_lookAt_spline = c_[lookAt_lat_list, lookAt_lng_list, lookAt_alt_list]
  T_lookAt_spline = c_[js['lookAtTvals'], js['lookAtTvals'], js['lookAtTvals']]
  P_lookAt_ease = c_[lookAt_easing_dlist]
  T_lookAt_ease = c_[lookAt_easing_tvals]  

  lastTime = js['lastTime'];

  millis = int(round(time.time() * 1000))
  np.savez(("shot-%d" % millis), 
    P_lookFrom_spline=P_lookFrom_spline,
    T_lookFrom_spline=T_lookFrom_spline,
    P_lookFrom_ease=P_lookFrom_ease,
    T_lookFrom_ease=T_lookFrom_ease,
    P_lookAt_spline=P_lookAt_spline,
    T_lookAt_spline=T_lookAt_spline,
    P_lookAt_ease=P_lookAt_ease,
    T_lookAt_ease=T_lookAt_ease,
    lastTime=[lastTime])

  P = np.array([
    P_lookFrom_spline,
    T_lookFrom_spline,
    P_lookFrom_ease,
    T_lookFrom_ease,
    P_lookAt_spline,
    T_lookAt_spline,
    P_lookAt_ease,
    T_lookAt_ease,
    [lastTime]
    ])

  export_data = {
    "command" : js['command'],
    "P_lookFrom_spline" :P_lookFrom_spline,
    "T_lookFrom_spline" :T_lookFrom_spline,
    "P_lookFrom_ease" :P_lookFrom_ease,
    "T_lookFrom_ease" :T_lookFrom_ease,
    "P_lookAt_spline" :P_lookAt_spline,
    "T_lookAt_spline" :T_lookAt_spline,
    "P_lookAt_ease" :P_lookAt_ease,
    "T_lookAt_ease" :T_lookAt_ease,
    "lastTime" :[lastTime]}

  print export_data
  headers = {'content-type': 'application/json'}
  r = requests.post("http://localhost:9000", data = jsonify(export_data), headers = headers);
  

  return jsonify({'result':'ok'})

@server.route('/api/calculate_feasibility_ned', methods = ['POST'])
def calculate_feasibility_ned():

  js = request.get_json()
  lookAtN   = js['lookAtN']
  lookAtE   = js['lookAtE']
  lookAtD   = js['lookAtD']
  lookFromN = js['lookFromN']
  lookFromE = js['lookFromE']
  lookFromD = js['lookFromD']

  # Exported Values

  P_lookFromNED_spline      = c_[lookFromN, lookFromE, lookFromD]
  T_lookFromNED_spline      = c_[js['lookFromT'], js['lookFromT'], js['lookFromT']]
  P_lookFromNED_ease        = c_[array(js['lookFromEasingD'])]
  T_lookFromNED_ease        = c_[array(js['lookFromEasingT'])]

  P_lookAtNED_spline        = c_[lookAtN, lookAtE, lookAtD]
  T_lookAtNED_spline        = c_[js['lookAtT'], js['lookAtT'], js['lookAtT']]
  P_lookAtNED_ease          = c_[array(js['lookAtEasingD'])]
  T_lookAtNED_ease          = c_[array(js['lookAtEasingT'])]  

  refLLH        = js['refLLH']
  total_time    = js['totalShotTime']

  # make a call to the trajectoryAPI
  u_nominal, p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, phi_body_nominal, theta_cam_nominal, theta_cam_dot_nominal, psi_cam_nominal, phi_cam_nominal, phi_cam_dot_nominal =   trajectoryAPI.calculate_feasibility_ned(P_lookFromNED_spline, T_lookFromNED_spline, P_lookAtNED_spline, T_lookAtNED_spline, P_lookFromNED_ease, T_lookFromNED_ease, P_lookAtNED_ease, T_lookAtNED_ease, total_time, refLLH);


  data = {
    'u_nominal': u_nominal.tolist(),
    'p_body_nominal': p_body_nominal.tolist(),
    'p_body_dot_nominal': p_body_dot_nominal.tolist(),
    'p_body_dot_dot_nominal': p_body_dot_dot_nominal.tolist(),
    'theta_body_nominal': theta_body_nominal.tolist(),
    'phi_body_nominal': phi_body_nominal.tolist(),
    'theta_cam_nominal': theta_cam_nominal.tolist(), 
    'theta_cam_dot_nominal': theta_cam_dot_nominal.tolist(), 
    'psi_cam_nominal': psi_cam_nominal.tolist(), 
    'phi_cam_nominal': phi_cam_nominal.tolist(), 
    'phi_cam_dot_nominal': phi_cam_dot_nominal.tolist(),
  }

  return jsonify(data)

@server.route('/api/calculate_feasibility', methods = ['POST'])
def calculate_feasibility():
  js = request.get_json()
  cameraPose_lat_list = js['cameraPoseLats']
  cameraPose_lng_list = js['cameraPoseLngs']
  cameraPose_alt_list = js['cameraPoseAlts']
  lookAt_lat_list = js['lookAtLats']
  lookAt_lng_list = js['lookAtLngs']
  lookAt_alt_list = js['lookAtAlts']

  T_cameraPose = c_[js['cameraPoseTvals'], js['cameraPoseTvals'], js['cameraPoseTvals']]
  T_lookAt = c_[js['lookAtTvals'], js['lookAtTvals'], js['lookAtTvals']]

  lookAt_easing_tvals = array(js['lookAtEasingT'])
  lookAt_easing_dlist = array(js['lookAtEasingD'])
  cameraPose_easing_tvals = array(js['cameraPoseEasingT'])
  cameraPose_easing_dlist = array(js['cameraPoseEasingD'])

  P_easingCameraPose = c_[cameraPose_easing_dlist]
  T_easingCameraPose = c_[cameraPose_easing_tvals]

  P_easingLookAt = c_[lookAt_easing_dlist]
  T_easingLookAt = c_[lookAt_easing_tvals]  

  P_cameraPose = c_[cameraPose_lat_list, cameraPose_lng_list, cameraPose_alt_list]

  P_lookAt = c_[lookAt_lat_list, lookAt_lng_list, lookAt_alt_list]

  total_time = js['totalShotTime']
  # make a call to the trajectoryAPI
  u_nominal, p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, phi_body_nominal, theta_cam_nominal, theta_cam_dot_nominal, psi_cam_nominal, phi_cam_nominal, phi_cam_dot_nominal = trajectoryAPI.calculate_feasibility(P_cameraPose, T_cameraPose, P_lookAt, T_lookAt, P_easingCameraPose, T_easingCameraPose, P_easingLookAt, T_easingLookAt, total_time)

  data = {
    'u_nominal': u_nominal.tolist(),
    'p_body_nominal': p_body_nominal.tolist(),
    'p_body_dot_nominal': p_body_dot_nominal.tolist(),
    'p_body_dot_dot_nominal': p_body_dot_dot_nominal.tolist(),
    'theta_body_nominal': theta_body_nominal.tolist(),
    'phi_body_nominal': phi_body_nominal.tolist(),
    'theta_cam_nominal': theta_cam_nominal.tolist(), 
    'theta_cam_dot_nominal': theta_cam_dot_nominal.tolist(), 
    'psi_cam_nominal': psi_cam_nominal.tolist(), 
    'phi_cam_nominal': phi_cam_nominal.tolist(), 
    'phi_cam_dot_nominal': phi_cam_dot_nominal.tolist(),
  }

  return jsonify(data)

@server.route('/api/get_fov.kml', methods = ['GET'])
def get_fov():
  GoProView = request.args.get('GoProView')
  GoProFOV = {'NARROW':64.4, 'MEDIUM':94.4, 'WIDE':118.2}
  if GoProView not in GoProFOV:
    GoProView = 'WIDE'
  fov      = GoProFOV[GoProView]
  lat      = request.args.get('lat')       or 37.42726975867168
  lng      = request.args.get('lng')       or -122.16676019825722
  altitude = request.args.get('altitude')  or 125
  heading  = request.args.get('heading')   or -31.127314342134174
  tilt     = request.args.get('tilt')      or 51.24538395621526

  view = {'lng':lng, 'lat':lat, 'altitude':altitude, 'heading': heading, 'tilt': tilt, 'fov':fov}
  return render_template('fov.kml', view=view)

@server.route('/api/set_vehicle_location', methods = ['GET'])
def set_vehicle_location():
  global starting_lat
  global starting_lng
  global vehicle_millis
  global current_lat
  global current_lng
  global mode
  global armed
  
  vehicle_millis = int(round(time.time() * 1000))
  
  armed = (request.args.get('armed') == 'True')
  mode = request.args.get('mode')

  if armed:
    current_lat = request.args.get('lat', 0)
    current_lng = request.args.get('lng', 0)
  else:
    starting_lat = request.args.get('lat', 0)
    starting_lng = request.args.get('lng', 0)
  return "OK"

@server.route('/api/get_vehicle_pos', methods= ['GET'])
def get_vehicle_pos():
  global vehicle_millis
  global starting_lat
  global starting_lng
  global vehicle_millis
  global current_lat
  global current_lng
  global mode
  global armed
  
  current_millis = int(round(time.time() * 1000))
  success = "success"
  if current_millis - vehicle_millis > TIMEOUT_MILLIS:
    mode = "NOT CONNECTED"
    armed = False
    starting_lat = starting_lng = 0
    success = 'no data'
  
  data = {'status':success, 'starting_lat':starting_lat, 'starting_lng':starting_lng, 'current_lat':current_lat, 'current_lng':current_lng, 'mode':mode}
  return jsonify(data)

@server.route('/api/set_elapsed_time', methods = ['GET'])
def set_elapsed_time():
  global real_elapsed_time
  real_elapsed_time = request.args.get('elapsed', -1)
  return "OK"

@server.route('/api/get_elapsed_time', methods= ['GET'])
def  get_elapsed_time():
  data = {'status':'no data'}
  if real_elapsed_time != -1:
    data = {'status':'success', 'elapsed':real_elapsed_time}
  return jsonify(data)
