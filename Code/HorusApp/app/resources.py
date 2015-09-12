from app import server
from flask import jsonify, request, url_for, redirect, render_template
from flask.ext.restful import Api, Resource

#FLASK-RESTFul

api = Api(server)

shots = [
  {
    'id'        : 0,
    'name'      : 'hoover_tower_1',
    'keyframes' : [
      { 'latitude'     : 37.42676894221754,
        'longitude'    : -122.16633723223875,
        'altitude'     : 134.4292622252118,
        'heading'      : -31.12892454756547,
        'tilt'         : 58.09268404216599,
        'roll'         : 0.012256310372561875,
        'altitudeMode' : 2
      },
      { 'latitude'     : 37.42780163777152,
        'longitude'    : -122.16587274719092,
        'altitude'     : 129.157534028593,
        'heading'      : -102.25627378296372,
        'tilt'         : 59.53995501534709,
        'roll'         : 0.011376824134275392,
        'altitudeMode' : 2
      },
    ],
  },
  {
    'id'        : 1,
    'name'      : 'gates_1',
    'keyframes' : [
      { 'latitude'     : 37.42676894221754,
        'longitude'    : -122.16633723223875,
        'altitude'     : 134.4292622252118,
        'heading'      : -31.12892454756547,
        'tilt'         : 58.09268404216599,
        'roll'         : 0.012256310372561875,
        'altitudeMode' : 2
      },
      { 'latitude'     : 37.42780163777152,
        'longitude'    : -122.16587274719092,
        'altitude'     : 129.157534028593,
        'heading'      : -102.25627378296372,
        'tilt'         : 59.53995501534709,
        'roll'         : 0.011376824134275392,
        'altitudeMode' : 2
      },
    ],
  }

]


# The default Backbone.js sync handler maps CRUD to REST like so:
#
# create -> POST   /collection
# read -> GET   /collection[/id]
# update -> PUT   /collection/id
# delete -> DELETE   /collection/id
#

#
# A shot is a sequence of keyframes
#
class Shot(Resource):
  def get(self, shot_id):
    return shots[shot_id]

  def put(self, shot_id):
    shot = request.json
    shot['id'] = shot_id
    shots[shot_id] = shot
    return shot, 201

  def delete(self, keyframe_id):
    #We ignore this so hard
    return '', 204

class ShotList(Resource):
  def get(self):
    return shots

  #Add a new shot
  def post(self):
    shot = request.json
    shot_id = len(shots)
    shot['id'] = shot_id
    shots.append(shot)
    return shot, 201

api.add_resource(Shot,     '/api/shots/<int:shot_id>')
api.add_resource(ShotList, '/api/shots')

