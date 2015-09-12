from pylab import *

import itertools
import sympy
import sympy.matrices
import sympy.physics
import sympy.physics.mechanics
import sympy.physics.mechanics.functions
import sympy.utilities.autowrap



def collect_into_dict_include_zero_and_constant_terms(expr, syms):
    
    expr_terms_dict = sympy.collect(expr,syms,exact=True,evaluate=False)
    for sym in syms:
        if sym not in expr_terms_dict.keys(): expr_terms_dict[sym] = 0
    if 1 not in expr_terms_dict: expr_terms_dict[1] = 0
    return expr_terms_dict



def construct_matrix_and_entries(prefix_name,shape):
    
    A_entries = matrix(sympy.symarray(prefix_name,shape))
    A  = sympy.Matrix.zeros(shape[0],shape[1])
    for r in range(A.rows):
        for c in range(A.cols):
            A[r,c] = A_entries[r,c]
    return A, A_entries



def construct_matrix_from_block_matrix(A_expr):

    A_expr           = sympy.BlockMatrix(A_expr)
    A_collapsed_expr = sympy.Matrix.zeros(A_expr.rows,A_expr.cols)
    for r in range(A_expr.rows):
        for c in range(A_expr.cols):
            A_collapsed_expr[r,c] = A_expr[r,c]
    return A_collapsed_expr



def construct_cross_product_left_term_matrix_from_vector(a_expr):

    return sympy.Matrix([[0,-a_expr[2],a_expr[1]],[a_expr[2],0,-a_expr[0]],[-a_expr[1],a_expr[0],0]])



def construct_axis_aligned_rotation_matrix_right_handed(angle_expr,axis):

    assert axis in [0,1,2]
    if axis == 0:
        return sympy.Matrix( [ [1, 0, 0], [0, sympy.cos(angle_expr), -sympy.sin(angle_expr)], [0, sympy.sin(angle_expr), sympy.cos(angle_expr)] ] )
    if axis == 1:
        return sympy.Matrix( [ [sympy.cos(angle_expr), 0, sympy.sin(angle_expr)], [0, 1, 0], [-sympy.sin(angle_expr), 0, sympy.cos(angle_expr)] ] )
    if axis == 2:
        return sympy.Matrix( [ [sympy.cos(angle_expr), -sympy.sin(angle_expr), 0], [sympy.sin(angle_expr), sympy.cos(angle_expr), 0], [0, 0, 1] ] )



def nsimplify_matrix(A_expr,constants=[],tolerance=None,full=False,rational=False):

    A_nsimplified_expr = sympy.Matrix.zeros(A_expr.rows,A_expr.cols)
    for r in range(A_expr.rows):
        for c in range(A_expr.cols):
            A_nsimplified_expr[r,c] = sympy.nsimplify(A_expr[r,c],constants,tolerance,full,rational)
    return A_nsimplified_expr



def dummify(expr,syms):

    old_expr = expr
    old_syms = syms

    old_syms_to_new_symbs_non_derivatives = dict( [ (old_sym, sympy.Symbol("_dummy_%s"%str(old_sym).replace(", ","_").replace("(","_").replace(")","_"))) for old_sym in old_syms if not old_sym.is_Derivative ] )
    old_syms_to_new_syms_derivatives      = dict( [ (old_sym, sympy.Symbol("_dummy_%s"%str(old_sym).replace(", ","_").replace("(","_").replace(")","_"))) for old_sym in old_syms if old_sym.is_Derivative ] )
    old_syms_to_new_syms                  = dict(old_syms_to_new_symbs_non_derivatives.items() + old_syms_to_new_syms_derivatives.items())
    new_syms                              = [ old_syms_to_new_syms[old_sym] for old_sym in old_syms ]

    new_expr = expr
    new_expr = new_expr.subs(old_syms_to_new_syms_derivatives)
    new_expr = new_expr.subs(old_syms_to_new_symbs_non_derivatives)

    return new_expr,new_syms



def construct_matrix_anon_funcs_lambdify(matrix_expr,syms):
    return _construct_matrix_anon_funcs(matrix_expr=matrix_expr,syms=syms,dummify=False,verbose=False,construct_func=_construct_anon_func_lambdify)

def construct_matrix_anon_funcs_autowrap(matrix_expr,syms,verbose=False):
    return _construct_matrix_anon_funcs(matrix_expr=matrix_expr,syms=syms,dummify=False,verbose=verbose,construct_func=_construct_anon_func_autowrap)

def construct_matrix_anon_funcs_ufuncify(matrix_expr,syms,verbose=False):
    return _construct_matrix_anon_funcs(matrix_expr=matrix_expr,syms=syms,dummify=False,verbose=verbose,construct_func=_construct_anon_func_ufuncify)

def evaluate_matrix_anon_funcs(matrix_anon_funcs,vals):

    num_evaluations = vals.shape[0]
    num_rows        = matrix_anon_funcs.shape[0]
    num_cols        = matrix_anon_funcs.shape[1]

    matrix_anon_funcs_eval = zeros((num_evaluations,num_rows,num_cols))

    for r in range(num_rows):
        for c in range(num_cols):
            matrix_anon_funcs_eval[:,r,c] = matrix_anon_funcs[r,c](*vals.T)

    return matrix_anon_funcs_eval



def _construct_matrix_anon_funcs(matrix_expr,syms,dummify,verbose,construct_func):

    matrix_anon_funcs = []
    for r in range(matrix_expr.rows):
        matrix_r_anon_funcs = []
        for c in range(matrix_expr.cols):
            matrix_expr_rc      = matrix_expr[r,c]
            matrix_rc_anon_func = construct_func(expr=matrix_expr_rc,syms=syms,dummify=dummify,verbose=verbose)
            if isinstance(matrix_r_anon_funcs,list): matrix_r_anon_funcs = matrix_rc_anon_func
            else:                                    matrix_r_anon_funcs = hstack((matrix_r_anon_funcs,matrix_rc_anon_func))
        if isinstance(matrix_anon_funcs,list): matrix_anon_funcs = matrix_r_anon_funcs
        else:                                  matrix_anon_funcs = vstack((matrix_anon_funcs,matrix_r_anon_funcs))

    return matrix_anon_funcs



def _construct_anon_func_lambdify(expr,syms,dummify,verbose):
    return sympy.lambdify(syms,expr,"numpy",dummify=dummify)

def _construct_anon_func_autowrap(expr,syms,dummify,verbose):
    return sympy.utilities.autowrap.autowrap(expr=expr,backend="cython",args=syms,verbose=verbose)

def _construct_anon_func_ufuncify(expr,syms,dummify,verbose):
    return sympy.utilities.autowrap.ufuncify(expr=expr,backend="numpy",args=syms,verbose=verbose)
