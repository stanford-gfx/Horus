from pylab import *
import scipy.interpolate
import sklearn.metrics

#Our libraries

import pathutils
pathutils.add_relative_to_current_source_file_path_to_sys_path("../..")

from coord_system import *
from flashlight.splineutils import *
from flashlight.curveutils import *
from flashlight.quadrotorcamera3d import *
from sets import Set

def _compute_param_spacing_L2_norm(P, alpha):
    D                   = sklearn.metrics.pairwise_distances(P,P)
    dist                = diag(D,k=1) + 0.01
    l                   = pow(dist,alpha)
    l_cum               = r_[0.0,cumsum(l)]

    T = np.tile(c_[l_cum], P.shape[1])
    return T

def _get_easing_spline_coefficients(P,T=None,S=None,Z=None,degree=9):
    return compute_minimum_variation_nonlocal_interpolating_b_spline_coefficients(P,T=T,S=S,Z=Z,degree=degree,lamb=[0,0,0,1,0],return_derivatives=False)
    #return compute_catmull_rom_spline_coefficients(P,T=T,S=None,Z=None,degree=3)

def _evaluate_easing_spline(C,T,sd,T_eval=None,num_samples=200):
    return evaluate_minimum_variation_nonlocal_interpolating_b_spline(C,T,sd,T_eval=T_eval,num_samples=num_samples)    
    #return evaluate_catmull_rom_spline(C,T,sd,T_eval=T_eval,num_samples=num_samples)

def compute_easing_curve(P,T=None,num_samples=200):

    has_valid_spline = False
    C = None
    sd = None
    S = Set([])
    Z = [0, -1]

    # Calculate the spline
    C,T,sd = _get_easing_spline_coefficients(P,T=T,S=list(S),Z=Z)

    Pev = None

    i = 0
    MAX_ITERS = 50
    while not has_valid_spline or i < MAX_ITERS:
        has_valid_spline = True
        # Calculate the spline
        C,T,sd = _get_easing_spline_coefficients(P,T=T,S=list(S),Z=Z)

        # then sample it
        Pev,Tev,dT = _evaluate_easing_spline(C,T,sd,num_samples=num_samples)
        
        Pev[0] = 0
        Pev[-1] = 1

        currentSection = 0
        invalidSection = False
        for i in range(len(Tev)):
            if i == len(Tev)-1 or Tev[i] > T[currentSection+1]:
                if invalidSection:
                    S = S.union(set([currentSection]))
                    if currentSection == 0:
                        try:
                            Z.remove(0)
                        except:
                            pass
                    if currentSection == len(T)-2:
                        try:
                            Z.remove(-1)
                        except:
                            pass

                currentSection = min(currentSection+1,len(T)-1)
                invalidSection = False

            if Pev[i] < -0.0000001 or Pev[i] > 1.0000001:
                invalidSection = True
                has_valid_spline = False

        i += 1
 
    assert min(Pev) > -0.0000001
    assert max(Pev) <  1.0000001

    return C,T,sd


def _get_spatial_spline_coefficients(P,T=None,S=None,degree=9,return_derivatives=False,uniformKnots=False):
    #return compute_catmull_rom_spline_coefficients(P,T=T,S=S,degree=degree)

    if T is None and not uniformKnots:
        T = _compute_param_spacing_L2_norm(P, 0.5)
        if T[-1,-1] > 0:
            T = T / T[-1,-1]
        #S = [0]
    if uniformKnots:
        T = None
    return compute_minimum_variation_nonlocal_interpolating_b_spline_coefficients(P,T=T,S=S,degree=9,lamb=[0,0,0,1,0],return_derivatives=False)

def _evaluate_spatial_spline(C,T,sd,T_eval=None,num_samples=200):
  #return evaluate_catmull_rom_spline(C,T,sd,num_samples=num_samples)
  return evaluate_minimum_variation_nonlocal_interpolating_b_spline(C,T,sd,T_eval=T_eval,num_samples=num_samples)

def compute_spatial_trajectory_and_arc_distance(P,T=None,S=None,num_samples=200,inNED=True):

    C,T,sd = _get_spatial_spline_coefficients(P,T=T,S=S,degree=9,return_derivatives=False)
    
    p,T_eval,dT = _evaluate_spatial_spline(C,T,sd,num_samples=num_samples)
    
    # Turn into NED:
    if not inNED:
        p = numpy.array([llh2ned(point, p[0]) for point in p])
    
    if len(p.shape) == 1:
        p = matrix(p).T
    else:
        p = matrix(p)

    num_samples_p             = p.shape[0]
    num_dimensions            = p.shape[1]

    t_p_linspace = linspace(0.0,T[-1,0],num_samples_p)
    
    D                   = sklearn.metrics.pairwise_distances(p,p)
    l                   = diag(D,k=1)
    l_cum               = r_[0.0,cumsum(l)]
    l_cum_f             = scipy.interpolate.interp1d(t_p_linspace, l_cum)
    
    knot_arc_distances  = l_cum_f(T[:,0])
    
    return C,T,sd,knot_arc_distances

def reparameterize_spline(P_spline, T_spline, P_ease, T_ease, num_samples=200, ref_llh = None, isNED=True):
    """

    This assumes the easing curve in position and time is normalized
        - P_Ease in [0,1]
        - T_Ease in [0,1]

    Input: A description of a spline, and an easing curve for time to distance (normalized).

    Calculates the (time -> distance -> spline parameter) mapping. 
    Returns the resulting table of time to spline parameter values, such that
    sweeping linearly through time will result in spline parameters that move along the spline
    according to the time->distance easing curve.

    """

    # First, calculate a spline for P_spline and P_ease
    C_spline,T_spline,sd_spline,dist = compute_spatial_trajectory_and_arc_distance(P_spline,T=T_spline)
    C_ease,T_ease,sd_ease = compute_easing_curve(P_ease,T=T_ease)

    # Then sample that densely
    Spline_eval,T_spline_eval,dT_spline = _evaluate_spatial_spline(C_spline,T_spline,sd_spline,num_samples=num_samples)
    Ease_eval,T_ease_eval,dT_ease = _evaluate_easing_spline(C_ease,T_ease,sd_ease,num_samples=num_samples)    
    
    if not isNED:
        if ref_llh is None:
            ref_llh = Spline_eval[0]
        # Move into NED space, where everything is in meters.
        Spline_eval = np.array([llh2ned(point, ref_llh) for point in Spline_eval])

    assert min(Ease_eval) > -0.0001
    assert max(Ease_eval) <  1.0001
    Ease_eval = Ease_eval[:,0]/Ease_eval[-1,0]
    Ease_eval = clip(Ease_eval,0,1)

    # Finally, reparameterize the spline curve first into dist then modulate with ease
    p_user_progress, t_user_progress, cumLength, t_user_progress_linspace_norm = reparameterize_curve(Spline_eval,Ease_eval)
    
    # Then return a table of t_user_progress_linspace_norm
    return t_user_progress_linspace_norm, t_user_progress, p_user_progress, ref_llh

def calculate_feasibility_ned(P_lookFrom_spline, T_lookFrom_spline, P_lookAt_spline, T_lookAt_spline, P_lookFrom_ease, T_lookFrom_ease, P_lookAt_ease, T_lookAt_ease, total_time, refLLH):
    lookFrom_t_user_progress_linspace_norm, lookFrom_t_user_progress, lookFrom_p_user_progress, lookFrom_ref_llh  = reparameterize_spline(P_lookFrom_spline, T_lookFrom_spline, P_lookFrom_ease, T_lookFrom_ease)
    lookAt_t_user_progress_linspace_norm, lookAt_t_user_progress, lookAt_p_user_progress, lookAt_ref_llh          = reparameterize_spline(P_lookAt_spline, T_lookAt_spline, P_lookAt_ease, T_lookAt_ease)

    y_axis_cam_hint_nominal = c_[ zeros_like(lookAt_t_user_progress),  ones_like(lookAt_t_user_progress), zeros_like(lookAt_t_user_progress) ]
    #do conversion

    #north, negative down, east
    i = numpy.array([0, 2, 1])
    lookFrom_p_user_progress = lookFrom_p_user_progress[:,i]
    lookAt_p_user_progress = lookAt_p_user_progress[:,i]

    #lookFrom_p_user_progress[:, 1] *= -1
    #lookAt_p_user_progress[:, 1] *= -1

    dt = lookAt_t_user_progress_linspace_norm[1] * total_time;

    q_q_dot_q_dot_dot_nominal = compute_state_space_trajectory_and_derivatives(lookFrom_p_user_progress,lookAt_p_user_progress,y_axis_cam_hint_nominal,dt)
    u_nominal                 = compute_control_trajectory(q_q_dot_q_dot_dot_nominal)

    p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, theta_body_dot_nominal, theta_body_dot_dot_nominal, psi_body_nominal, psi_body_dot_nominal, psi_body_dot_dot_nominal, phi_body_nominal, phi_body_dot_nominal, phi_body_dot_dot_nominal, theta_cam_nominal, theta_cam_dot_nominal, theta_cam_dot_dot_nominal, psi_cam_nominal, psi_cam_dot_nominal, psi_cam_dot_dot_nominal, phi_cam_nominal, phi_cam_dot_nominal, phi_cam_dot_dot_nominal  = q_q_dot_q_dot_dot_nominal
    
    return u_nominal, p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, phi_body_nominal, theta_cam_nominal, theta_cam_dot_nominal, psi_cam_nominal, phi_cam_nominal, phi_cam_dot_nominal


def calculate_feasibility(P_cameraPose, T_cameraPose, P_lookAt, T_lookAt, P_easingCameraPose, T_easingCameraPose, P_easingLookAt, T_easingLookAt, total_time):
    lookFrom_t_user_progress_linspace_norm, lookFrom_t_user_progress, lookFrom_p_user_progress, lookFrom_ref_llh = reparameterize_spline(P_cameraPose, T_cameraPose, P_easingCameraPose, T_easingCameraPose)
    lookAt_t_user_progress_linspace_norm, lookAt_t_user_progress, lookAt_p_user_progress, lookAt_ref_llh = reparameterize_spline(P_lookAt, T_lookAt, P_easingLookAt, T_easingLookAt, ref_llh=lookFrom_ref_llh)

    y_axis_cam_hint_nominal = c_[ zeros_like(lookAt_t_user_progress),  ones_like(lookAt_t_user_progress), zeros_like(lookAt_t_user_progress) ]
    #do conversion

    #north, negative down, east
    i = numpy.array([0, 2, 1])
    lookFrom_p_user_progress = lookFrom_p_user_progress[:,i]
    lookAt_p_user_progress = lookAt_p_user_progress[:,i]

    lookFrom_p_user_progress[:, 1] *= -1
    lookAt_p_user_progress[:, 1] *= -1

    dt = lookAt_t_user_progress_linspace_norm[1] * total_time;

    q_q_dot_q_dot_dot_nominal = compute_state_space_trajectory_and_derivatives(lookFrom_p_user_progress,lookAt_p_user_progress,y_axis_cam_hint_nominal,dt)
    u_nominal                 = compute_control_trajectory(q_q_dot_q_dot_dot_nominal)

    p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, theta_body_dot_nominal, theta_body_dot_dot_nominal, psi_body_nominal, psi_body_dot_nominal, psi_body_dot_dot_nominal, phi_body_nominal, phi_body_dot_nominal, phi_body_dot_dot_nominal, theta_cam_nominal, theta_cam_dot_nominal, theta_cam_dot_dot_nominal, psi_cam_nominal, psi_cam_dot_nominal, psi_cam_dot_dot_nominal, phi_cam_nominal, phi_cam_dot_nominal, phi_cam_dot_dot_nominal  = q_q_dot_q_dot_dot_nominal
    return u_nominal, p_body_nominal, p_body_dot_nominal, p_body_dot_dot_nominal, theta_body_nominal, phi_body_nominal, theta_cam_nominal, theta_cam_dot_nominal, psi_cam_nominal, phi_cam_nominal, phi_cam_dot_nominal

