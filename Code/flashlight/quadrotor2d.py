from pylab import *

import matplotlib.animation
import scipy.interpolate
import scipy.integrate
import sklearn
import sklearn.preprocessing
import control
import transformations
import sympy
import sympy.matrices
import sympy.physics
import sympy.physics.mechanics
import sympy.physics.mechanics.functions
import trigutils
import sympyutils
import pathutils



m = 1.0      # mass
g = 9.8      # gravity
d = 1.0      # distance from arm to center
I = m*d**2.0 # moment of intertia

f_gravity_world  = matrix([-m*g,0]).T
f_external_world = f_gravity_world

construct_sympy_expressions = False



if construct_sympy_expressions:

    print "Constructing sympy symbols..."

    d_expr = sympy.Symbol("d")
    m_expr = sympy.Symbol("m")
    I_expr = sympy.Symbol("I")

    f_external_expr, f_external_expr_entries = sympyutils.construct_matrix_and_entries("f_e",(2,1))

    t_expr = sympy.Symbol("t")

    p_y_expr   = sympy.physics.mechanics.dynamicsymbols("p_y")
    p_x_expr   = sympy.physics.mechanics.dynamicsymbols("p_x")
    theta_expr = sympy.physics.mechanics.dynamicsymbols("theta")

    q_expr     = sympy.Matrix([p_y_expr,p_x_expr,theta_expr])
    q_dot_expr = q_expr.diff(t_expr)

    u_expr, u_expr_entries = sympyutils.construct_matrix_and_entries("u",(2,1))

    print "Constructing sympy expressions..."

    H_00_expr = sympy.Matrix(m_expr*sympy.eye(2))
    H_01_expr = sympy.Matrix.zeros(2,1)
    H_10_expr = sympy.Matrix.zeros(1,2)
    H_11_expr = sympy.Matrix([I_expr])

    C_00_expr = sympy.Matrix.zeros(2,2)
    C_01_expr = sympy.Matrix.zeros(2,1)
    C_10_expr = sympy.Matrix.zeros(1,2)
    C_11_expr = sympy.Matrix.zeros(1,1)

    G_0_expr = -f_external_expr
    G_1_expr = sympy.Matrix.zeros(1,1)

    B_0_expr  = sympy.Matrix( [ [sympy.cos(theta_expr),sympy.cos(theta_expr)], [-sympy.sin(theta_expr),-sympy.sin(theta_expr)] ] )
    B_1_expr  = sympy.Matrix( [ [-d_expr,d_expr] ] )

    H_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [H_00_expr, H_01_expr], [H_10_expr, H_11_expr] ] ) )
    C_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [C_00_expr, C_01_expr], [C_10_expr, C_11_expr] ] ) )
    G_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [G_0_expr],             [G_1_expr] ] ) )
    B_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [B_0_expr],             [B_1_expr] ] ) )

    q_dot_dot_expr = H_expr.inv()*(B_expr*u_expr - (C_expr*q_dot_expr + G_expr))

    dqdotdot_dq_expr    = q_dot_dot_expr.jacobian(q_expr)
    dqdotdot_dqdot_expr = q_dot_dot_expr.jacobian(q_dot_expr)

    const_syms   = hstack( [ d_expr, m_expr, I_expr, matrix(f_external_expr).A1 ] )
    x_and_u_syms = hstack( [ matrix(q_expr).A1, matrix(q_dot_expr).A1, matrix(u_expr).A1 ] )

    print "Substituting physical constants into sympy expressions..."

    const_vals = hstack( [ d, m, I, f_external_world.A1 ] )
    const_subs = dict(zip(const_syms,const_vals))

    dqdotdot_dq_expr    = sympyutils.nsimplify_matrix(dqdotdot_dq_expr.subs(const_subs))
    dqdotdot_dqdot_expr = sympyutils.nsimplify_matrix(dqdotdot_dqdot_expr.subs(const_subs))

    print "Dummifying sympy expressions..."

    dqdotdot_dq_expr_dummy,    dqdotdot_dq_expr_dummy_syms    = sympyutils.dummify(dqdotdot_dq_expr,   x_and_u_syms)
    dqdotdot_dqdot_expr_dummy, dqdotdot_dqdot_expr_dummy_syms = sympyutils.dummify(dqdotdot_dqdot_expr,x_and_u_syms)

    print "Saving sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dq_expr_dummy.dat",         "w") as f: f.write(sympy.srepr(dqdotdot_dq_expr_dummy))
    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dqdot_expr_dummy.dat",      "w") as f: f.write(sympy.srepr(dqdotdot_dqdot_expr_dummy))

    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dq_expr_dummy_syms.dat",    "w") as f: f.write(sympy.srepr(sympy.Matrix(dqdotdot_dq_expr_dummy_syms)))
    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dqdot_expr_dummy_syms.dat", "w") as f: f.write(sympy.srepr(sympy.Matrix(dqdotdot_dqdot_expr_dummy_syms)))

else:

    print "Loading sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dq_expr_dummy.dat",         "r") as f: dqdotdot_dq_expr_dummy    = sympy.sympify(f.read())
    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dqdot_expr_dummy.dat",      "r") as f: dqdotdot_dqdot_expr_dummy = sympy.sympify(f.read())

    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dq_expr_dummy_syms.dat",    "r") as f: dqdotdot_dq_expr_dummy_syms    = array(sympy.sympify(f.read())).squeeze()
    with open(current_source_file_path+"/data/sympy/quadrotor2d_dqdotdot_dqdot_expr_dummy_syms.dat", "r") as f: dqdotdot_dqdot_expr_dummy_syms = array(sympy.sympify(f.read())).squeeze()

print "Compiling sympy functions..."

dqdotdot_dq_anon_funcs_ufuncify    = sympyutils.construct_matrix_anon_funcs_ufuncify(dqdotdot_dq_expr_dummy,    dqdotdot_dq_expr_dummy_syms)
dqdotdot_dqdot_anon_funcs_ufuncify = sympyutils.construct_matrix_anon_funcs_ufuncify(dqdotdot_dqdot_expr_dummy, dqdotdot_dqdot_expr_dummy_syms)

print "Finished compiling sympy functions."



def unpack_state(x):

    p         = matrix( [ x.item(0), x.item(1) ] ).T
    theta     = x.item(2)
    p_dot     = matrix( [ x.item(3), x.item(4) ] ).T
    theta_dot = x.item(5)
    q         = matrix( [ p.item(0),     p.item(1),     theta ] ).T
    q_dot     = matrix( [ p_dot.item(0), p_dot.item(1), theta_dot ] ).T

    return p, theta, p_dot, theta_dot, q, q_dot



def compute_manipulator_matrices(x):

    p, theta, p_dot, theta_dot, q, q_dot = unpack_state(x)

    H_00 = matrix(m*identity(2))
    H_01 = matrix(zeros((2,1)))
    H_10 = matrix(zeros((1,2)))
    H_11 = matrix(I)

    C_00 = matrix(zeros((2,2)))
    C_01 = matrix(zeros((2,1)))
    C_10 = matrix(zeros((1,2)))
    C_11 = matrix(zeros((1,1)))

    G_0 = -f_external_world
    G_1 = matrix(zeros((1,1)))

    B_0  = matrix( [ [cos(theta),cos(theta)], [-sin(theta),-sin(theta)] ] )
    B_1  = matrix( [ [-d,d] ] )

    H = bmat( [ [H_00, H_01], [H_10, H_11] ] )
    C = bmat( [ [C_00, C_01], [C_10, C_11] ] )
    G = bmat( [ [G_0], [G_1] ] )
    B = bmat( [ [B_0], [B_1] ] )

    return H, C, G, B



def compute_manipulator_matrix_derivatives(x,u):

    p, theta, p_dot, theta_dot, q, q_dot = unpack_state(x)

    x_and_u_vals = hstack( [ q.A1, q_dot.A1, u.A1 ] )

    # slow
    # x_and_u_subs   = dict(zip(x_and_u_syms,x_and_u_vals))
    # dqdotdot_dq    = dqdotdot_dq_expr.subs(x_and_u_subs).evalf()
    # dqdotdot_dqdot = dqdotdot_dqdot_expr.subs(x_and_u_subs).evalf()

    # fast
    dqdotdot_dq    = matrix(sympyutils.evaluate_matrix_anon_funcs( dqdotdot_dq_anon_funcs_ufuncify,    x_and_u_vals[newaxis,:] ))
    dqdotdot_dqdot = matrix(sympyutils.evaluate_matrix_anon_funcs( dqdotdot_dqdot_anon_funcs_ufuncify, x_and_u_vals[newaxis,:] ))

    return dqdotdot_dq, dqdotdot_dqdot



def compute_df_dx_and_df_du(x,u):

    H, C, G, B                  = compute_manipulator_matrices(x)
    dqdotdot_dq, dqdotdot_dqdot = compute_manipulator_matrix_derivatives(x,u)

    dqdot_dq       = matrix(zeros((3,3)))
    dqdot_dqdot    = matrix(identity(3))
    dqdotdot_dq    = dqdotdot_dq
    dqdotdot_dqdot = dqdotdot_dqdot

    dqdot_du       = matrix(zeros((3,2)))
    dqdotdot_du    = H.I*B

    df_dx = bmat( [ [ dqdot_dq, dqdot_dqdot ],  [ dqdotdot_dq, dqdotdot_dqdot ] ] )
    df_du = bmat( [ [ dqdot_du ],               [ dqdotdot_du ] ] )

    return df_dx, df_du



def compute_x_dot(x,u):

    p, theta, p_dot, theta_dot, q, q_dot = unpack_state(x)
    H, C, G, B                           = compute_manipulator_matrices(x)

    f1 = H.I*(-G-C*q_dot)
    f2 = H.I*B
    
    q_dot_dot = f1 + f2*u

    x_dot = bmat([[q_dot],[q_dot_dot]])

    return x_dot



def compute_state_space_trajectory_and_derivatives(p,dt):

    f_thrust_world_norm_threshold = 0.01

    num_timesteps = len(p)

    p_dot                     = c_[gradient(p[:,0],dt),gradient(p[:,1],dt)]
    p_dot_dot                 = c_[gradient(p_dot[:,0],dt),gradient(p_dot[:,1],dt)]
    f_thrust_world            = m*p_dot_dot - f_external_world.T.A

    f_thrust_world_norm = linalg.norm(f_thrust_world,axis=1)

    theta_raw  = arctan2(f_thrust_world[:,0],f_thrust_world[:,1]) - (pi/2.0)
    t_tmp      = arange(num_timesteps)
    theta_func = scipy.interpolate.interp1d(t_tmp[f_thrust_world_norm > f_thrust_world_norm_threshold], theta_raw[f_thrust_world_norm > f_thrust_world_norm_threshold], kind="linear")
    theta      = theta_func(t_tmp)

    theta         = trigutils.compute_continuous_angle_array(theta)
    theta_dot     = gradient(theta,dt)
    theta_dot_dot = gradient(theta_dot,dt)

    return p, p_dot, p_dot_dot, theta, theta_dot, theta_dot_dot



def compute_control_trajectory(q_q_dot_q_dot_dot):

    p, p_dot, p_dot_dot, theta, theta_dot, theta_dot_dot = q_q_dot_q_dot_dot

    num_timesteps = len(p)
    
    u = zeros((num_timesteps,2))

    for ti in range(int(num_timesteps)):

        q_ti         = matrix( [ p[ti,0],         p[ti,1],         theta[ti]         ] ).T
        q_dot_ti     = matrix( [ p_dot[ti,0],     p_dot[ti,1],     theta_dot[ti]     ] ).T
        q_dot_dot_ti = matrix( [ p_dot_dot[ti,0], p_dot_dot[ti,1], theta_dot_dot[ti] ] ).T
        x_ti         = bmat( [[q_ti], [q_dot_ti]] )

        H, C, G, B = compute_manipulator_matrices(x_ti)

        f1      = H.I*(-G-C*q_dot_ti)
        f2      = H.I*B
        f2_pinv = linalg.pinv(f2)
        u_ti    = f2_pinv*(q_dot_dot_ti - f1)
        u[ti,:] = u_ti.T

    return u
