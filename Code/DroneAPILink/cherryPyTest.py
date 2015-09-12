import time, signal, os, threading
import cherrypy
import Queue

loc = 15
q = Queue.Queue(maxsize=0)

class HelloWorld(object):
  def index(self):
    global loc
    loc += 1
    q.put('Hello')
    return "Hello World! Loc = %s" % loc

  index.exposed = True

class ListenForStuff(threading.Thread):
  def __init__(self):
    super(ListenForStuff, self).__init__()
    self.firstRun = False
    self.start()

  def run(self):
    if self.firstRun == False:
      self.firstRun = True
      cherrypy.quickstart(HelloWorld())
    return

# def handler(signal, frame):
#   print "Exiting"
#   cherrypy.engine.stop()  
#   sys.exit(0)

# signal.signal(signal.SIGTERM, handler)

listener = ListenForStuff()

while True:

  print "Still looping. Value of loc = %s" % loc

  time.sleep(1)

