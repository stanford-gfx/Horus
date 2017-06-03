# Horus: An Interactive Tool for Designing Quadrotor Camera Shots

Horus is an interactive tool for designing quadrotor camera shots. We describe Horus in detail in the following paper.

[An Interactive Tool for Designing Quadrotor Camera Shots](http://stanford-gfx.github.io/Horus/)  
Niels Joubert, Mike Roberts, Anh Truong, Floraine Berthouzoz, Pat Hanrahan  
ACM Transactions on Graphics 34(6) (SIGGRAPH Asia 2015)

If you use Horus for published work, we encourage you to cite this paper.

## Using Horus as a Standalone Library

Much of the functionality that exists in Horus for computing quadrotor trajectories is available in the standalone Python library [Flashlight](http://mikeroberts3000.github.io/flashlight).

## Horus Installation Instructions

**Update: Unfortunately, the Google Earth web API upon which Horus was built has been [deprecated](https://developers.google.com/earth/). We hope that Google will re-introduce the Google Earth web API soon. Until then, there is no way to run Horus without significant developer effort. In the meantime, we are choosing to leave the installation instructions here in case Google re-introduces the relevant API. The core functionality in Horus is still available in the standalone Python library [Flashlight](http://mikeroberts3000.github.io/flashlight).**

Horus is an in-browser Javascript application with a Python backend. It relies on the Google Earth NSAPI plugin and Google Chromium. We tested Horus exclusively on Mac OS X.

The steps for installing Horus are as follows. If you have any questions, email [Mike Roberts](mailto:mlrobert@stanford.edu).

1. Download and install all of Horus' dependencies.

  * Chromium. Google stopped supporting Google Earth in the default Chrome, so you'll need to use a very specific version of Chromium. Navigate to to the following URL to download Chromium.
    * http://sourceforge.net/projects/osxportableapps/files/Chromium/  
    (make sure to download `ChromiumOSX_38.0.2125.122.dmg`)
  * Google Earth for Chromium. Navigate to the following URL in Chromium to install Google Earth for Chromium.
    * https://www.google.com/earth/explore/products/plugin.html
  * Python packages. I personally like using pip to install Python packages. Alternatively, you can also download each from these packages from source. We list the Python packages required by Horus, and the pip commands required to install them.
    * Flask
      * `sudo pip install flask`
    * Flask-RESTful
      * `sudo pip install flask-restful`
    * scikit-learn and its dependencies
      * `sudo pip install -U numpy scipy scikit-learn`
    * cvxopt
      * `sudo pip install cvxopt`

2. In the terminal, run the following commands:
  ```
  cd path/to/Frankencopter/Code/HorusApp  
  python run.py
  ```
  You should see the following console output:
  ```
   * Running on http://127.0.0.1:5000  
   * Restarting with reloader
  ```
  You will also see the following warning message:
  ```
  transformations.py:1888: UserWarning: failed to import module _transformations warnings.warn("failed to import module %s" % name)
  ```
  You can ignore this warning.

3. Navigate to the URL `localhost:5000` in Chromium. You are now ready to start using Horus.
