from pylab import *

import scipy.interpolate

def interp1d_vector_wrt_scalar(x,t,kind="linear"):

    interp1d_funcs = []

    for d in range(x.shape[1]):
        interp1d_funcs.append(scipy.interpolate.interp1d(t,x[:,d],kind=kind))

    def interp1d_vector_wrt_scalar_func(t):
        t    = matrix(t).astype(float64).A1
        vals = zeros((t.shape[0],len(interp1d_funcs)))
        for d in range(len(interp1d_funcs)):
            vals[:,d] = interp1d_funcs[d](t)
        return vals

    return interp1d_vector_wrt_scalar_func
