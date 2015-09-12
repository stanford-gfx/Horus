from pylab import *

import sklearn
import sklearn.preprocessing
import transformations
import linalgutils
import trigutils
import sympy
import sympy.matrices
import sympy.physics
import sympy.physics.mechanics
import sympy.physics.mechanics.functions
import trigutils
import sympyutils
import pathutils



front_prop_and_quad_positive_x_axis_angle = pi/4
rear_prop_and_quad_negative_x_axis_angle  = pi/4
y_axis_torque_per_newton_per_prop         = 1

alpha = front_prop_and_quad_positive_x_axis_angle
beta  = rear_prop_and_quad_negative_x_axis_angle
gamma = y_axis_torque_per_newton_per_prop

d = 1.0                          # distance from arm to center
m = 1.0                          # mass
g = 9.8                          # gravity
I = m*d**2.0*matrix(identity(3)) # moment of intertia for body

f_gravity_world  = matrix([0,-m*g,0]).T
f_external_world = f_gravity_world

construct_sympy_expressions = False



if construct_sympy_expressions:

    print "Constructing sympy symbols..."

    d_expr                                   = sympy.Symbol("d")
    alpha_expr                               = sympy.Symbol("alpha")
    beta_expr                                = sympy.Symbol("beta")
    gamma_expr                               = sympy.Symbol("gamma")
    m_expr                                   = sympy.Symbol("m")
    I_expr, I_expr_entries                   = sympyutils.construct_matrix_and_entries("I",(3,3))
    f_external_expr, f_external_expr_entries = sympyutils.construct_matrix_and_entries("f_e",(3,1))

    t_expr = sympy.Symbol("t")

    p_z_expr   = sympy.physics.mechanics.dynamicsymbols("p_z")
    p_y_expr   = sympy.physics.mechanics.dynamicsymbols("p_y")
    p_x_expr   = sympy.physics.mechanics.dynamicsymbols("p_x")
    theta_expr = sympy.physics.mechanics.dynamicsymbols("theta")
    psi_expr   = sympy.physics.mechanics.dynamicsymbols("psi")
    phi_expr   = sympy.physics.mechanics.dynamicsymbols("phi")

    q_expr     = sympy.Matrix([p_z_expr,p_y_expr,p_x_expr,theta_expr,psi_expr,phi_expr])
    q_dot_expr = q_expr.diff(t_expr)

    u_expr, u_expr_entries = sympyutils.construct_matrix_and_entries("u",(4,1))

    theta_dot_expr = theta_expr.diff(t_expr)
    psi_dot_expr   = psi_expr.diff(t_expr)
    phi_dot_expr   = phi_expr.diff(t_expr)

    print "Constructing sympy expressions..."

    R_z_theta_expr = sympyutils.construct_axis_aligned_rotation_matrix_right_handed(theta_expr,0)
    R_y_psi_expr   = sympyutils.construct_axis_aligned_rotation_matrix_right_handed(psi_expr,1)
    R_x_phi_expr   = sympyutils.construct_axis_aligned_rotation_matrix_right_handed(phi_expr,2)

    R_expr         = sympy.trigsimp(R_y_psi_expr*R_z_theta_expr*R_x_phi_expr);
    R_dot_expr     = sympy.trigsimp(R_expr.diff(t_expr));
    R_dot_R_T_expr = sympy.trigsimp(R_dot_expr*R_expr.T);

    omega_z_terms_expr = sympyutils.collect_into_dict_include_zero_and_constant_terms( R_dot_R_T_expr[2,1],  [theta_dot_expr,psi_dot_expr,phi_dot_expr] )
    omega_y_terms_expr = sympyutils.collect_into_dict_include_zero_and_constant_terms( -R_dot_R_T_expr[2,0], [theta_dot_expr,psi_dot_expr,phi_dot_expr] )
    omega_x_terms_expr = sympyutils.collect_into_dict_include_zero_and_constant_terms( R_dot_R_T_expr[1,0],  [theta_dot_expr,psi_dot_expr,phi_dot_expr] )

    A_expr = sympy.Matrix( [ \
        [ omega_z_terms_expr[theta_dot_expr], omega_z_terms_expr[psi_dot_expr], omega_z_terms_expr[phi_dot_expr] ], \
        [ omega_y_terms_expr[theta_dot_expr], omega_y_terms_expr[psi_dot_expr], omega_y_terms_expr[phi_dot_expr] ], \
        [ omega_x_terms_expr[theta_dot_expr], omega_x_terms_expr[psi_dot_expr], omega_x_terms_expr[phi_dot_expr] ] ] )

    A_dot_expr = sympy.trigsimp(A_expr.diff(t_expr))

    R_world_from_body_expr = R_expr
    R_body_from_world_expr = R_world_from_body_expr.T

    euler_dot_expr         = sympy.Matrix([theta_dot_expr,psi_dot_expr,phi_dot_expr])
    omega_in_body_expr     = sympy.trigsimp(R_body_from_world_expr*A_expr*euler_dot_expr)
    I_omega_in_body_X_expr = sympyutils.construct_cross_product_left_term_matrix_from_vector(I_expr*omega_in_body_expr)

    M_thrust_body_from_control_expr = sympy.Matrix([[0,0,0,0],[1,1,1,1],[0,0,0,0]])

    M_torque_body_from_control_expr = sympy.Matrix(([ \
        [-d_expr*sympy.cos(alpha_expr),d_expr*sympy.cos(beta_expr),d_expr*sympy.cos(beta_expr),-d_expr*sympy.cos(alpha_expr)], \
        [gamma_expr,-gamma_expr,gamma_expr,-gamma_expr], \
        [d_expr*sympy.sin(alpha_expr),d_expr*sympy.sin(beta_expr),-d_expr*sympy.sin(beta_expr),-d_expr*sympy.sin(alpha_expr)]]))

    H_00_expr    = sympy.Matrix(m_expr*sympy.eye(3))
    H_11_expr    = sympy.trigsimp(I_expr*R_body_from_world_expr*A_expr)
    H_zeros_expr = sympy.Matrix.zeros(3,3)

    C_11_expr    = I_expr*R_body_from_world_expr*A_dot_expr - I_omega_in_body_X_expr*R_body_from_world_expr*A_expr
    C_zeros_expr = sympy.Matrix.zeros(3,3)

    G_0_expr = -f_external_expr
    G_1_expr = sympy.Matrix.zeros(3,1)

    B_0_expr = R_world_from_body_expr*M_thrust_body_from_control_expr
    B_1_expr = M_torque_body_from_control_expr

    H_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [H_00_expr,      H_zeros_expr], [H_zeros_expr, H_11_expr] ] ) )
    C_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [C_zeros_expr,   C_zeros_expr], [C_zeros_expr, C_11_expr] ] ) )
    G_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [G_0_expr],                     [G_1_expr] ] ) )
    B_expr = sympyutils.construct_matrix_from_block_matrix( sympy.Matrix( [ [B_0_expr],                     [B_1_expr] ] ) )

    q_dot_dot_expr = H_expr.inv()*(B_expr*u_expr - (C_expr*q_dot_expr + G_expr))

    dqdotdot_dq_expr    = q_dot_dot_expr.jacobian(q_expr)
    dqdotdot_dqdot_expr = q_dot_dot_expr.jacobian(q_dot_expr)

    const_syms   = hstack( [ d_expr, alpha_expr, beta_expr, gamma_expr, m_expr, matrix(I_expr).A1, matrix(f_external_expr).A1 ] )
    x_syms       = hstack( [ matrix(q_expr).A1, matrix(q_dot_expr).A1 ] )
    x_and_u_syms = hstack( [ matrix(q_expr).A1, matrix(q_dot_expr).A1, matrix(u_expr).A1 ] )

    print "Substituting physical constants into sympy expressions..."

    const_vals = hstack( [ d, alpha, beta, gamma, m, I.A1, f_external_world.A1 ] )
    const_subs = dict(zip(const_syms,const_vals))

    A_expr              = sympyutils.nsimplify_matrix(A_expr.subs(const_subs))
    A_dot_expr          = sympyutils.nsimplify_matrix(A_dot_expr.subs(const_subs))
    dqdotdot_dq_expr    = sympyutils.nsimplify_matrix(dqdotdot_dq_expr.subs(const_subs))
    dqdotdot_dqdot_expr = sympyutils.nsimplify_matrix(dqdotdot_dqdot_expr.subs(const_subs))

    print "Dummifying sympy expressions..."

    A_expr_dummy,              A_expr_dummy_syms              = sympyutils.dummify( A_expr,              x_syms )
    A_dot_expr_dummy,          A_dot_expr_dummy_syms          = sympyutils.dummify( A_dot_expr,          x_syms )
    dqdotdot_dq_expr_dummy,    dqdotdot_dq_expr_dummy_syms    = sympyutils.dummify( dqdotdot_dq_expr,    x_and_u_syms )
    dqdotdot_dqdot_expr_dummy, dqdotdot_dqdot_expr_dummy_syms = sympyutils.dummify( dqdotdot_dqdot_expr, x_and_u_syms )

    print "Saving sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_expr_dummy.dat",              "w") as f: f.write(sympy.srepr(A_expr_dummy))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_dot_expr_dummy.dat",          "w") as f: f.write(sympy.srepr(A_dot_expr_dummy))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dq_expr_dummy.dat",    "w") as f: f.write(sympy.srepr(dqdotdot_dq_expr_dummy))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dqdot_expr_dummy.dat", "w") as f: f.write(sympy.srepr(dqdotdot_dqdot_expr_dummy))

    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_expr_dummy_syms.dat",              "w") as f: f.write(sympy.srepr(sympy.Matrix(A_expr_dummy_syms)))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_dot_expr_dummy_syms.dat",          "w") as f: f.write(sympy.srepr(sympy.Matrix(A_dot_expr_dummy_syms)))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dq_expr_dummy_syms.dat",    "w") as f: f.write(sympy.srepr(sympy.Matrix(dqdotdot_dq_expr_dummy_syms)))
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dqdot_expr_dummy_syms.dat", "w") as f: f.write(sympy.srepr(sympy.Matrix(dqdotdot_dqdot_expr_dummy_syms)))

else:

    print "Loading sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_expr_dummy.dat",              "r") as f: A_expr_dummy              = sympy.sympify(f.read())
    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_dot_expr_dummy.dat",          "r") as f: A_dot_expr_dummy          = sympy.sympify(f.read())
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dq_expr_dummy.dat",    "r") as f: dqdotdot_dq_expr_dummy    = sympy.sympify(f.read())
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dqdot_expr_dummy.dat", "r") as f: dqdotdot_dqdot_expr_dummy = sympy.sympify(f.read())

    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_expr_dummy_syms.dat",              "r") as f: A_expr_dummy_syms              = array(sympy.sympify(f.read())).squeeze()
    with open(current_source_file_path+"/data/sympy/quadrotor3d_A_dot_expr_dummy_syms.dat",          "r") as f: A_dot_expr_dummy_syms          = array(sympy.sympify(f.read())).squeeze()
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dq_expr_dummy_syms.dat",    "r") as f: dqdotdot_dq_expr_dummy_syms    = array(sympy.sympify(f.read())).squeeze()
    with open(current_source_file_path+"/data/sympy/quadrotor3d_dqdotdot_dqdot_expr_dummy_syms.dat", "r") as f: dqdotdot_dqdot_expr_dummy_syms = array(sympy.sympify(f.read())).squeeze()

print "Compiling sympy functions..."

A_anon_funcs_ufuncify              = sympyutils.construct_matrix_anon_funcs_ufuncify(A_expr_dummy,              A_expr_dummy_syms)
A_dot_anon_funcs_ufuncify          = sympyutils.construct_matrix_anon_funcs_ufuncify(A_dot_expr_dummy,          A_dot_expr_dummy_syms)
dqdotdot_dq_anon_funcs_ufuncify    = sympyutils.construct_matrix_anon_funcs_ufuncify(dqdotdot_dq_expr_dummy,    dqdotdot_dq_expr_dummy_syms)
dqdotdot_dqdot_anon_funcs_ufuncify = sympyutils.construct_matrix_anon_funcs_ufuncify(dqdotdot_dqdot_expr_dummy, dqdotdot_dqdot_expr_dummy_syms)

print "Finished compiling sympy functions."



def unpack_state(x):

    p         = matrix( [ x.item(0), x.item(1), x.item(2) ] ).T
    theta     = x.item(3)
    psi       = x.item(4)
    phi       = x.item(5)
    p_dot     = matrix( [ x.item(6), x.item(7), x.item(8) ] ).T
    theta_dot = x.item(9)
    psi_dot   = x.item(10)
    phi_dot   = x.item(11)
    q         = matrix( [ p.item(0),     p.item(1),     p.item(2),     theta,     psi,     phi,    ] ).T
    q_dot     = matrix( [ p_dot.item(0), p_dot.item(1), p_dot.item(2), theta_dot, psi_dot, phi_dot ] ).T

    return p, theta, psi, phi, p_dot, theta_dot, psi_dot, phi_dot, q, q_dot



def compute_manipulator_matrices(x):

    p, theta, psi, phi, p_dot, theta_dot, psi_dot, phi_dot, q, q_dot = unpack_state(x)

    R_world_from_body = matrix(transformations.euler_matrix(psi,theta,phi,"ryxz"))[0:3,0:3]
    R_body_from_world = R_world_from_body.T

    x_vals = hstack( [ q.A1, q_dot.A1 ] )
    A      = matrix(sympyutils.evaluate_matrix_anon_funcs( A_anon_funcs_ufuncify,     x_vals[newaxis,:] ))
    A_dot  = matrix(sympyutils.evaluate_matrix_anon_funcs( A_dot_anon_funcs_ufuncify, x_vals[newaxis,:] ))

    euler_dot         = matrix([theta_dot,psi_dot,phi_dot]).T
    omega_in_body     = R_body_from_world*A*euler_dot
    I_omega_in_body_X = linalgutils.cross_product_left_term_matrix_from_vector(I*omega_in_body)

    M_thrust_body_from_control = matrix([[0,0,0,0],[1,1,1,1],[0,0,0,0]])
    M_torque_body_from_control = matrix([[-d*cos(alpha),d*cos(beta),d*cos(beta),-d*cos(alpha)],[gamma,-gamma,gamma,-gamma],[d*sin(alpha),d*sin(beta),-d*sin(beta),-d*sin(alpha)]])
 
    # H
    H_00    = matrix(m*identity(3))
    H_11    = I*R_body_from_world*A
    H_zeros = matrix(zeros((3,3)))

    # C
    C_11    = I*R_body_from_world*A_dot - I_omega_in_body_X*R_body_from_world*A
    C_zeros = matrix(zeros((3,3)))

    # G
    G_0 = -f_external_world
    G_1 = matrix(zeros((3,1)))

    # B
    B_0 = R_world_from_body*M_thrust_body_from_control
    B_1 = M_torque_body_from_control

    H = bmat( [ [H_00,    H_zeros], [H_zeros, H_11] ] )
    C = bmat( [ [C_zeros, C_zeros], [C_zeros, C_11] ] )
    G = bmat( [ [G_0], [G_1] ] )
    B = bmat( [ [B_0], [B_1] ] )

    return H, C, G, B



def compute_manipulator_matrix_derivatives(x,u):

    "compute_manipulator_matrix_derivatives begin"

    p, theta, psi, phi, p_dot, theta_dot, psi_dot, phi_dot, q, q_dot = unpack_state(x)

    x_and_u_vals   = hstack( [ q.A1, q_dot.A1, u.A1 ] )
    dqdotdot_dq    = matrix(sympyutils.evaluate_matrix_anon_funcs( dqdotdot_dq_anon_funcs_ufuncify,    x_and_u_vals[newaxis,:] ))
    dqdotdot_dqdot = matrix(sympyutils.evaluate_matrix_anon_funcs( dqdotdot_dqdot_anon_funcs_ufuncify, x_and_u_vals[newaxis,:] ))

    return dqdotdot_dq, dqdotdot_dqdot



def compute_df_dx_and_df_du(x,u):

    H, C, G, B                  = compute_manipulator_matrices(x)
    dqdotdot_dq, dqdotdot_dqdot = compute_manipulator_matrix_derivatives(x,u)

    dqdot_dq       = matrix(zeros((6,6)))
    dqdot_dqdot    = matrix(identity(6))
    dqdotdot_dq    = dqdotdot_dq
    dqdotdot_dqdot = dqdotdot_dqdot

    dqdot_du       = matrix(zeros((6,4)))
    dqdotdot_du    = H.I*B

    df_dx = bmat( [ [ dqdot_dq, dqdot_dqdot ],  [ dqdotdot_dq, dqdotdot_dqdot ] ] )
    df_du = bmat( [ [ dqdot_du ],               [ dqdotdot_du ] ] )

    return df_dx, df_du



def compute_x_dot(x,u):

    p, theta, psi, phi, p_dot, theta_dot, psi_dot, phi_dot, q, q_dot = unpack_state(x)

    H, C, G, B = compute_manipulator_matrices(x)

    f1 = H.I*(-G-C*q_dot)
    f2 = H.I*B
    
    q_dot_dot = f1 + f2*u

    x_dot = bmat([[q_dot],[q_dot_dot]])

    return x_dot



def compute_state_space_trajectory_and_derivatives(p,psi,dt):

    num_timesteps = len(p)

    psi = trigutils.compute_continuous_angle_array(psi)

    p_dot     = c_[ gradient(p[:,0],dt),     gradient(p[:,1],dt),     gradient(p[:,2],dt)]
    p_dot_dot = c_[ gradient(p_dot[:,0],dt), gradient(p_dot[:,1],dt), gradient(p_dot[:,2],dt)]

    f_thrust_world            = m*p_dot_dot - f_external_world.T.A
    f_thrust_world_normalized = sklearn.preprocessing.normalize(f_thrust_world)

    z_axis_intermediate = c_[ cos(psi), zeros_like(psi), -sin(psi) ]
    y_axis              = f_thrust_world_normalized
    x_axis              = sklearn.preprocessing.normalize(cross(z_axis_intermediate, y_axis))
    z_axis              = sklearn.preprocessing.normalize(cross(y_axis, x_axis))

    theta          = zeros(num_timesteps)
    psi_recomputed = zeros(num_timesteps)
    phi            = zeros(num_timesteps)

    for ti in range(num_timesteps):

        z_axis_ti = c_[matrix(z_axis[ti]),0].T
        y_axis_ti = c_[matrix(y_axis[ti]),0].T
        x_axis_ti = c_[matrix(x_axis[ti]),0].T

        R_world_from_body_ti              = c_[z_axis_ti,y_axis_ti,x_axis_ti,[0,0,0,1]]
        psi_recomputed_ti,theta_ti,phi_ti = transformations.euler_from_matrix(R_world_from_body_ti,"ryxz")

        assert allclose(R_world_from_body_ti, transformations.euler_matrix(psi_recomputed_ti,theta_ti,phi_ti,"ryxz"))

        theta[ti]          = theta_ti
        psi_recomputed[ti] = psi_recomputed_ti
        phi[ti]            = phi_ti

    theta          = trigutils.compute_continuous_angle_array(theta)
    psi_recomputed = trigutils.compute_continuous_angle_array(psi_recomputed)
    phi            = trigutils.compute_continuous_angle_array(phi)

    assert allclose(psi_recomputed, psi)

    psi = psi_recomputed

    theta_dot     = gradient(theta,dt)
    psi_dot       = gradient(psi,dt)
    phi_dot       = gradient(phi,dt)

    theta_dot_dot = gradient(theta_dot,dt)
    psi_dot_dot   = gradient(psi_dot,dt)
    phi_dot_dot   = gradient(phi_dot,dt)

    return p, p_dot, p_dot_dot, theta, theta_dot, theta_dot_dot, psi, psi_dot, psi_dot_dot, phi, phi_dot, phi_dot_dot



def compute_control_trajectory(q_q_dot_q_dot_dot):

    p, p_dot, p_dot_dot, theta, theta_dot, theta_dot_dot, psi, psi_dot, psi_dot_dot, phi, phi_dot, phi_dot_dot = q_q_dot_q_dot_dot

    num_timesteps = len(p)
    
    u = zeros((num_timesteps,4))

    for ti in range(num_timesteps):

        q_ti         = matrix( [ p[ti,0],         p[ti,1],         p[ti,2],         theta[ti],         psi[ti],         phi[ti],        ] ).T
        q_dot_ti     = matrix( [ p_dot[ti,0],     p_dot[ti,1],     p_dot[ti,2],     theta_dot[ti],     psi_dot[ti],     phi_dot[ti],    ] ).T
        q_dot_dot_ti = matrix( [ p_dot_dot[ti,0], p_dot_dot[ti,1], p_dot_dot[ti,2], theta_dot_dot[ti], psi_dot_dot[ti], phi_dot_dot[ti] ] ).T
        x_ti         = bmat( [[q_ti],[q_dot_ti]] )
        
        H, C, G, B = compute_manipulator_matrices(x_ti)

        f1      = H.I*(-G-C*q_dot_ti)
        f2      = H.I*B
        f2_pinv = linalg.pinv(f2)
        u_ti    = f2_pinv*(q_dot_dot_ti - f1)
        u[ti,:] = u_ti.T

    return u
