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



m      = 1.0                          # mass
g      = 9.8                          # gravity
d      = 1.0                          # distance from arm to center
I_body = m*d**2.0*matrix(identity(3)) # moment of intertia for body
I_cam  = matrix(identity(3))          # moment of intertia for camera

f_gravity_world  = matrix([0,-m*g,0]).T
f_external_world = f_gravity_world

construct_sympy_expressions = False



if construct_sympy_expressions:

    print "Constructing sympy symbols..."

    t_expr             = sympy.Symbol("t")
    theta_expr         = sympy.physics.mechanics.dynamicsymbols("theta")
    psi_expr           = sympy.physics.mechanics.dynamicsymbols("psi")
    phi_expr           = sympy.physics.mechanics.dynamicsymbols("phi")

    theta_dot_expr     = theta_expr.diff(t_expr)
    psi_dot_expr       = psi_expr.diff(t_expr)
    phi_dot_expr       = phi_expr.diff(t_expr)

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

    syms = [ theta_expr, psi_expr, phi_expr, theta_dot_expr, psi_dot_expr, phi_dot_expr ]

    print "Dummifying sympy expressions..."

    A_expr_dummy,     A_expr_dummy_syms     = sympyutils.dummify( A_expr,     syms )
    A_dot_expr_dummy, A_dot_expr_dummy_syms = sympyutils.dummify( A_dot_expr, syms )

    print "Saving sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_expr_dummy.dat",     "w") as f: f.write(sympy.srepr(A_expr_dummy))
    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_dot_expr_dummy.dat", "w") as f: f.write(sympy.srepr(A_dot_expr_dummy))

    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_expr_dummy_syms.dat",     "w") as f: f.write(sympy.srepr(sympy.Matrix(A_expr_dummy_syms)))
    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_dot_expr_dummy_syms.dat", "w") as f: f.write(sympy.srepr(sympy.Matrix(A_dot_expr_dummy_syms)))

else:

    print "Loading sympy expressions..."

    current_source_file_path = pathutils.get_current_source_file_path()

    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_expr_dummy.dat",     "r") as f: A_expr_dummy     = sympy.sympify(f.read())
    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_dot_expr_dummy.dat", "r") as f: A_dot_expr_dummy = sympy.sympify(f.read())

    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_expr_dummy_syms.dat",     "r") as f: A_expr_dummy_syms     = array(sympy.sympify(f.read())).squeeze()
    with open(current_source_file_path+"/data/sympy/quadrotorcamera3d_A_dot_expr_dummy_syms.dat", "r") as f: A_dot_expr_dummy_syms = array(sympy.sympify(f.read())).squeeze()

print "Compiling sympy functions..."

A_anon_funcs_ufuncify     = sympyutils.construct_matrix_anon_funcs_ufuncify(A_expr_dummy,     A_expr_dummy_syms)
A_dot_anon_funcs_ufuncify = sympyutils.construct_matrix_anon_funcs_ufuncify(A_dot_expr_dummy, A_dot_expr_dummy_syms)

print "Finished compiling sympy functions."



def unpack_state(x):

    p_body         = matrix( [ x.item(0), x.item(1), x.item(2) ] ).T
    theta_body     = x.item(3)
    psi_body       = x.item(4)
    phi_body       = x.item(5)
    theta_cam      = x.item(6)
    psi_cam        = x.item(7)
    phi_cam        = x.item(8)
    p_body_dot     = matrix( [ x.item(9), x.item(10), x.item(11) ] ).T
    theta_body_dot = x.item(12)
    psi_body_dot   = x.item(13)
    phi_body_dot   = x.item(14)
    theta_cam_dot  = x.item(15)
    psi_cam_dot    = x.item(16)
    phi_cam_dot    = x.item(17)
    q              = matrix( [ p_body.item(0),     p_body.item(1),     p_body.item(2),     theta_body,     psi_body,     phi_body,     theta_cam,     psi_cam,     phi_cam,    ] ).T
    q_dot          = matrix( [ p_body_dot.item(0), p_body_dot.item(1), p_body_dot.item(2), theta_body_dot, psi_body_dot, phi_body_dot, theta_cam_dot, psi_cam_dot, phi_cam_dot ] ).T

    return p_body, theta_body, psi_body, phi_body, theta_cam, psi_cam, phi_cam, p_body_dot, theta_body_dot, psi_body_dot, phi_body_dot, theta_cam_dot, psi_cam_dot, phi_cam_dot, q, q_dot



def compute_manipulator_matrices(x):

    front_prop_and_quad_positive_x_axis_angle = pi/4
    rear_prop_and_quad_negative_x_axis_angle  = pi/4
    y_axis_torque_per_newton_per_prop         = 1

    alpha = front_prop_and_quad_positive_x_axis_angle
    beta  = rear_prop_and_quad_negative_x_axis_angle
    gamma = y_axis_torque_per_newton_per_prop

    p_body, theta_body, psi_body, phi_body, theta_cam, psi_cam, phi_cam, p_body_dot, theta_body_dot, psi_body_dot, phi_body_dot, theta_cam_dot, psi_cam_dot, phi_cam_dot, q, q_dot = unpack_state(x)

    R_world_from_body = matrix(transformations.euler_matrix(psi_body,theta_body,phi_body,"ryxz"))[0:3,0:3]
    R_body_from_world = R_world_from_body.T

    R_body_from_cam = matrix(transformations.euler_matrix(psi_cam,theta_cam,phi_cam,"ryxz"))[0:3,0:3]
    R_cam_from_body = R_body_from_cam.T

    subs_body  = array( [ theta_body, psi_body, phi_body, theta_body_dot, psi_body_dot, phi_body_dot ] )
    A_body     = matrix(sympyutils.evaluate_matrix_anon_funcs( A_anon_funcs_ufuncify,     subs_body[newaxis,:] ))
    A_body_dot = matrix(sympyutils.evaluate_matrix_anon_funcs( A_dot_anon_funcs_ufuncify, subs_body[newaxis,:] ))

    subs_cam   = array( [ theta_cam, psi_cam, phi_cam, theta_cam_dot, psi_cam_dot, phi_cam_dot ] )
    A_cam      = matrix(sympyutils.evaluate_matrix_anon_funcs( A_anon_funcs_ufuncify,     subs_cam[newaxis,:] ))
    A_cam_dot  = matrix(sympyutils.evaluate_matrix_anon_funcs( A_dot_anon_funcs_ufuncify, subs_cam[newaxis,:] ))

    euler_body_dot              = matrix([theta_body_dot,psi_body_dot,phi_body_dot]).T
    omega_body_in_body          = R_body_from_world*A_body*euler_body_dot
    I_body_omega_body_in_body_X = linalgutils.cross_product_left_term_matrix_from_vector(I_body*omega_body_in_body)

    euler_cam_dot            = matrix([theta_cam_dot,psi_cam_dot,phi_cam_dot]).T
    omega_cam_in_cam         = R_cam_from_body*A_cam*euler_cam_dot
    I_cam_omega_cam_in_cam_X = linalgutils.cross_product_left_term_matrix_from_vector(I_cam*omega_cam_in_cam)

    M_thrust_body_from_control = matrix([[0,0,0,0],[1,1,1,1],[0,0,0,0]])
    M_torque_body_from_control = matrix([[-d*cos(alpha),d*cos(beta),d*cos(beta),-d*cos(alpha)],[gamma,-gamma,gamma,-gamma],[d*sin(alpha),d*sin(beta),-d*sin(beta),-d*sin(alpha)]])
 
    # H
    H_00    = matrix(m*identity(3))
    H_11    = I_body*R_body_from_world*A_body
    H_22    = A_cam
    H_zeros = matrix(zeros((3,3)))

    # C
    C_11    = I_body*R_body_from_world*A_body_dot - I_body_omega_body_in_body_X*R_body_from_world*A_body
    C_22    = A_cam_dot
    C_zeros = matrix(zeros((3,3)))

    # G
    G_0 = -f_external_world
    G_1 = matrix(zeros((3,1)))
    G_2 = matrix(zeros((3,1)))

    # B
    B_00 = R_world_from_body*M_thrust_body_from_control
    B_01 = matrix(zeros((3,3)))
    B_10 = M_torque_body_from_control
    B_11 = matrix(zeros((3,3)))
    B_20 = matrix(zeros((3,4)))
    B_21 = matrix(identity(3))

    H = bmat( [ [H_00,    H_zeros, H_zeros], [H_zeros, H_11, H_zeros], [H_zeros, H_zeros, H_22 ] ] )
    C = bmat( [ [C_zeros, C_zeros, C_zeros], [C_zeros, C_11, C_zeros], [C_zeros, C_zeros, C_22 ] ] )
    G = bmat( [ [G_0], [G_1],[G_2] ] )
    B = bmat( [ [B_00, B_01], [B_10, B_11], [B_20, B_21] ] )

    return H, C, G, B



def compute_x_dot(x,u):

    p_body, theta_body, psi_body, phi_body, theta_cam, psi_cam, phi_cam, p_body_dot, theta_body_dot, psi_body_dot, phi_body_dot, theta_cam_dot, psi_cam_dot, phi_cam_dot, q, q_dot = unpack_state(x)

    H, C, G, B = compute_manipulator_matrices(x)

    f1 = H.I*(-G-C*q_dot)
    f2 = H.I*B
    
    q_dot_dot = f1 + f2*u

    x_dot = bmat([[q_dot],[q_dot_dot]])

    return x_dot



def compute_state_space_trajectory_and_derivatives(p_body,p_look_at,y_axis_cam_hint,dt):

    num_timesteps = len(p_body)

    #
    # compute the yaw, roll, and pitch of the quad using differential flatness
    #
    p_body_dot     = c_[ gradient(p_body[:,0],dt),     gradient(p_body[:,1],dt),     gradient(p_body[:,2],dt)]
    p_body_dot_dot = c_[ gradient(p_body_dot[:,0],dt), gradient(p_body_dot[:,1],dt), gradient(p_body_dot[:,2],dt)]

    f_thrust_world            = m*p_body_dot_dot - f_external_world.T.A
    f_thrust_world_normalized = sklearn.preprocessing.normalize(f_thrust_world)

    y_axis_body = f_thrust_world_normalized    
    z_axis_body = sklearn.preprocessing.normalize(cross(y_axis_body, p_look_at - p_body))
    x_axis_body = sklearn.preprocessing.normalize(cross(z_axis_body, y_axis_body))

    R_world_from_body = zeros((num_timesteps,4,4))
    theta_body        = zeros(num_timesteps)
    psi_body          = zeros(num_timesteps)
    phi_body          = zeros(num_timesteps)

    for ti in range(num_timesteps):

        z_axis_body_ti = c_[matrix(z_axis_body[ti]),0].T
        y_axis_body_ti = c_[matrix(y_axis_body[ti]),0].T
        x_axis_body_ti = c_[matrix(x_axis_body[ti]),0].T

        R_world_from_body_ti                  = c_[z_axis_body_ti,y_axis_body_ti,x_axis_body_ti,[0,0,0,1]]
        psi_body_ti,theta_body_ti,phi_body_ti = transformations.euler_from_matrix(R_world_from_body_ti,"ryxz")

        assert allclose(R_world_from_body_ti, transformations.euler_matrix(psi_body_ti,theta_body_ti,phi_body_ti,"ryxz"))

        R_world_from_body[ti] = R_world_from_body_ti
        theta_body[ti]        = theta_body_ti
        psi_body[ti]          = psi_body_ti
        phi_body[ti]          = phi_body_ti

    psi_body   = trigutils.compute_continuous_angle_array(psi_body)
    theta_body = trigutils.compute_continuous_angle_array(theta_body)
    phi_body   = trigutils.compute_continuous_angle_array(phi_body)

    #
    # now that we have the full orientation of the quad, compute the full orientation of the camera relative to the quad
    #
    x_axis_cam = sklearn.preprocessing.normalize( p_look_at - p_body )
    z_axis_cam = sklearn.preprocessing.normalize( cross(y_axis_cam_hint, x_axis_cam) )
    y_axis_cam = sklearn.preprocessing.normalize( cross(x_axis_cam,      z_axis_cam) )

    theta_cam  = zeros(num_timesteps)
    psi_cam    = zeros(num_timesteps)
    phi_cam    = zeros(num_timesteps)

    for ti in range(num_timesteps):

        z_axis_cam_ti = c_[matrix(z_axis_cam[ti]),0].T
        y_axis_cam_ti = c_[matrix(y_axis_cam[ti]),0].T
        x_axis_cam_ti = c_[matrix(x_axis_cam[ti]),0].T

        R_world_from_cam_ti  = matrix(c_[z_axis_cam_ti, y_axis_cam_ti, x_axis_cam_ti, [0,0,0,1]])
        R_world_from_body_ti = matrix(R_world_from_body[ti])
        R_body_from_cam_ti   = R_world_from_body_ti.T*R_world_from_cam_ti

        psi_cam_ti, theta_cam_ti, phi_cam_ti = transformations.euler_from_matrix(R_body_from_cam_ti,"ryxz")

        #
        # sanity check that world-from-body rotation matrix we compute actually
        # maps the vector [0,0,1] to the quadrotor x axis
        #
        assert allclose(c_[matrix(x_axis_body[ti]),1].T, R_world_from_body_ti*matrix([0,0,1,1]).T)

        #
        # sanity check that the world-from-camera rotation matrix we compute actually
        # maps the vector [0,0,1] to the camera x axis
        #
        assert allclose(c_[matrix(x_axis_cam[ti]),1].T, R_world_from_cam_ti*matrix([0,0,1,1]).T)

        #
        # sanity check that the world-from-body and body-from-camera rotation matrices
        # we compute actually maps the vector [0,0,1] to the camera x axis
        #        
        assert allclose(c_[matrix(x_axis_cam[ti]),1].T, R_world_from_body_ti*R_body_from_cam_ti*matrix([0,0,1,1]).T)

        theta_cam[ti] = theta_cam_ti
        psi_cam[ti]   = psi_cam_ti
        phi_cam[ti]   = phi_cam_ti

    theta_cam = trigutils.compute_continuous_angle_array(theta_cam)
    psi_cam   = trigutils.compute_continuous_angle_array(psi_cam)
    phi_cam   = trigutils.compute_continuous_angle_array(phi_cam)

    #
    # assert that we never need any camera yaw in the body frame of the quad
    #
    assert allclose(psi_cam, 0)

    #
    # compute derivatives
    #
    theta_body_dot     = gradient(theta_body,dt)
    psi_body_dot       = gradient(psi_body,dt)
    phi_body_dot       = gradient(phi_body,dt)

    theta_cam_dot      = gradient(theta_cam,dt)
    psi_cam_dot        = gradient(psi_cam,dt)
    phi_cam_dot        = gradient(phi_cam,dt)

    theta_body_dot_dot = gradient(theta_body_dot,dt)
    psi_body_dot_dot   = gradient(psi_body_dot,dt)
    phi_body_dot_dot   = gradient(phi_body_dot,dt)

    theta_cam_dot_dot  = gradient(theta_cam_dot,dt)
    psi_cam_dot_dot    = gradient(psi_cam_dot,dt)
    phi_cam_dot_dot    = gradient(phi_cam_dot,dt)

    return p_body, p_body_dot, p_body_dot_dot, theta_body, theta_body_dot, theta_body_dot_dot, psi_body, psi_body_dot, psi_body_dot_dot, phi_body, phi_body_dot, phi_body_dot_dot, theta_cam, theta_cam_dot, theta_cam_dot_dot, psi_cam, psi_cam_dot, psi_cam_dot_dot, phi_cam, phi_cam_dot, phi_cam_dot_dot



def compute_control_trajectory(q_q_dot_q_dot_dot):

    p_body, p_body_dot, p_body_dot_dot, theta_body, theta_body_dot, theta_body_dot_dot, psi_body, psi_body_dot, psi_body_dot_dot, phi_body, phi_body_dot, phi_body_dot_dot, theta_cam, theta_cam_dot, theta_cam_dot_dot, psi_cam, psi_cam_dot, psi_cam_dot_dot, phi_cam, phi_cam_dot, phi_cam_dot_dot = q_q_dot_q_dot_dot

    num_timesteps = len(p_body)
    
    u = zeros((num_timesteps,7))

    for ti in range(num_timesteps):

        q_ti         = matrix( [ p_body[ti,0],         p_body[ti,1],         p_body[ti,2],         theta_body[ti],         psi_body[ti],         phi_body[ti],         theta_cam[ti],         psi_cam[ti],         phi_cam[ti]         ] ).T
        q_dot_ti     = matrix( [ p_body_dot[ti,0],     p_body_dot[ti,1],     p_body_dot[ti,2],     theta_body_dot[ti],     psi_body_dot[ti],     phi_body_dot[ti],     theta_cam_dot[ti],     psi_cam_dot[ti],     phi_cam_dot[ti]     ] ).T
        q_dot_dot_ti = matrix( [ p_body_dot_dot[ti,0], p_body_dot_dot[ti,1], p_body_dot_dot[ti,2], theta_body_dot_dot[ti], psi_body_dot_dot[ti], phi_body_dot_dot[ti], theta_cam_dot_dot[ti], psi_cam_dot_dot[ti], phi_cam_dot_dot[ti] ] ).T
        x_ti         = bmat( [[q_ti],[q_dot_ti]] )
        
        H, C, G, B = compute_manipulator_matrices(x_ti)

        f1      = H.I*(-G-C*q_dot_ti)
        f2      = H.I*B
        f2_pinv = linalg.pinv(f2)
        u_ti    = f2_pinv*(q_dot_dot_ti - f1)
        u[ti,:] = u_ti.T

    return u
