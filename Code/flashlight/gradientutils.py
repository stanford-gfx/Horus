from pylab import *

def gradient_scalar_wrt_scalar_non_const_dt(x,t): 

    x            = x.astype(float64).squeeze()
    t            = t.astype(float64).squeeze()
    x_grad       = zeros_like(x)
    x_grad[0]    = (x[1]  - x[0])   / (t[1]  - t[0])
    x_grad[-1]   = (x[-1] - x[-2])  / (t[-1] - t[-2])
    x_grad[1:-1] = (x[2:] - x[:-2]) / (t[2:] - t[:-2])

    return x_grad

def gradient_vector_wrt_scalar_non_const_dt(x,t):

    x_grad = zeros_like(x)

    for d in range(x.shape[1]):
        x_grad[:,d] = gradient_scalar_wrt_scalar_non_const_dt(x[:,d],t)

    return x_grad

def gradient_vector_wrt_scalar(x,dt):

    x_grad = zeros_like(x)

    for d in range(x.shape[1]):
        x_grad[:,d] = gradient(x[:,d],dt)

    return x_grad
