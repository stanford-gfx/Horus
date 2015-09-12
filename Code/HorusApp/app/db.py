import os
from os import path
from werkzeug import secure_filename
import json
from StringIO import StringIO

import subprocess

class ShotDB():
  def __init__(self, directory):
    self._d = directory

  def get_shots(self):
    shots = [ s for s in os.listdir(self._d) if path.isdir(path.join(self._d,s)) ]
    return shots

  # Returns the saved shotname (might be different), or False on failure
  # Assumes that "data" is a json string
  def set_shot(self, shotname, data):
    secure_shotname = secure_filename(shotname)
    shotpath = path.join(self._d, secure_shotname)
    
    if not os.path.isdir(shotpath):
      os.makedirs(shotpath)
    revisions = [ s for s in os.listdir(shotpath) if path.isfile(path.join(shotpath,s)) and ".json" in s ]
    revisions.sort()
    shotrevision = 1
    if revisions:
      shotrevision = int(os.path.splitext(revisions[-1])[0]) + 1
      print shotrevision
    filename = "%.4d.json" % shotrevision
    print "Saving shot %s revision %s as %s" % (shotname, filename, secure_shotname)

    gitversion = subprocess.check_output(["git", "describe", "--dirty"])
    decoded = json.load(StringIO(data))
    decoded['git-describe'] = gitversion
    data = json.dumps(decoded, separators=(',',':'))

    with open(os.path.join(shotpath, filename), "w") as f:
      f.write(data)

    return secure_shotname

  # Returns the stored shot data for the LATEST revision as per the numbering scheme
  # Returns a json string
  def get_shot(self, shotname, rev=-1):
    secure_shotname = secure_filename(shotname)
    shotpath = path.join(self._d, secure_shotname)
    print shotpath

    if not os.path.isdir(shotpath):
      return False

    revisions = [ s for s in os.listdir(shotpath) if path.isfile(path.join(shotpath,s)) and ".json" in s ]
    revisions.sort()
    if not revisions:
      return False    

    data = None
    filename = revisions[rev]
    with open(os.path.join(shotpath, filename), "r") as f:
      data = f.read()

    #Inject the total number of revisions into the shot
    decoded = json.load(StringIO(data))
    decoded['revisions'] = len(revisions)
    data = json.dumps(decoded, separators=(',',':'))

    return data, len(revisions)

  # check if shotname is valid
  def shot_exists(self, shotname):
    secure_shotname = secure_filename(shotname)
    shotpath = path.join(self._d, secure_shotname)
    return os.path.isdir(shotpath)

  # Returns False, or a python object
  def get_log(self, shotname):
    return False

  def test(self):
    print self._d    

