from flask import Flask
import db

# Global server variable 
server = Flask(__name__)

#Load the file-backed Database of Shots
db = db.ShotDB("data/shots")

from app import views
from app import resources
