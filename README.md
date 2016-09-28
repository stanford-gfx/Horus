# Horus: An Interactive Tool for Designing Quadrotor Camera Shots

Horus is an interactive tool for designing quadrotor camera shots. We describe Horus in detail in the following paper.

[An Interactive Tool for Designing Quadrotor Camera Shots](http://stanford-gfx.github.io/Horus/)  
Niels Joubert, Mike Roberts, Anh Truong, Floraine Berthouzoz, Pat Hanrahan  
ACM Transactions on Graphics 34(6) (SIGGRAPH Asia 2015)

If you use Horus for published work, we encourage you to cite this paper.

## Using Horus as a Standalone Library

Much of the functionality that exists in Horus for computing quadrotor trajectories is available in the standalone Python library [Flashlight](http://mikeroberts3000.github.io/flashlight).

## Horus Installation Instructions

Horus is an in-browser Javascript application with a Python backend. It relies on the Google Earth NSAPI plugin and Google Chromium. We tested Horus exclusively on Mac OS X. If you have any questions, email [Mike Roberts](mailto:mlrobert@stanford.edu).

To get Horus running, you'll need to download a few things if you don't already have them.

* Chromium browser (Google stopped supporting the Google Earth plug-in in Chrome)
  * http://sourceforge.net/projects/osxportableapps/files/Chromium/, download "ChromiumOSX_38.0.2125.122.dmg"
* Google Earth (visit this URL from within the Chromium browser you just downloaded, to install Google Earth into Chromium)
  * https://www.google.com/earth/explore/products/plugin.html
* Python packages
  * I personally like using pip for my Python installations. Alternatively you can also download each from these from source. If you want, instructions to install pip are at https://pip.pypa.io/en/latest/installing.html.
  * Flask
    * `sudo pip install flask`
  * Flask-RESTful
    * `sudo pip install flask-restful`
  * scikit-learn and its dependencies
    * `sudo pip install -U numpy scipy scikit-learn`
  * cvxopt
    * `sudo pip install cvxopt`

Then in the terminal, run these commands:  
* `cd path/to/Frankencopter/Code/HorusApp`  
* `python run.py`

You should see something like this print out in the console:
```
 * Running on http://127.0.0.1:5000  
 * Restarting with reloader
```

You will also see the following warning message:
```
transformations.py:1888: UserWarning: failed to import module _transformations warnings.warn("failed to import module %s" % name)
```

You can ignore this warning.

Finally, go to the URL `localhost:5000` in Chromium, and you'll be ready to start using Horus.
