from pylab import *

import scipy.interpolate
import sklearn.metrics



def reparameterize_curve(p,user_progress):

    """

Reparameterizes the curve p, using the progress curve specified in
user_progress. This function assumes that the values in user_progress
are in the range [0,1].

Returns the reparameterized curve, the normalized progress values that
induce the reparameterized curve, the total length of the curve, and an
array filled with linearly spaced samples in the range [0,1] that is
same length as the reparameterized curve.

    """

    if len(p.shape) == 1:
        p = matrix(p).T
    else:
        p = matrix(p)

    num_samples_p             = p.shape[0]
    num_samples_user_progress = len(user_progress)
    num_dimensions            = p.shape[1]

    t_p_linspace_norm   = linspace(0.0,1.0,num_samples_p)
    D                   = sklearn.metrics.pairwise_distances(p,p)
    l                   = diag(D,k=1)
    l_cum               = r_[0.0,cumsum(l)]
    l_cum_norm          = l_cum / l_cum[-1]

    tol  = 0.0001
    inds = r_[ where(diff(l_cum_norm) >= tol)[0] ]

    if inds[0] != 0:
        inds = r_[ 0, inds ]
    if inds[-1] != num_samples_p-1:
        inds = r_[ inds, num_samples_p-1 ]

    l_cum_norm_inv_func = scipy.interpolate.interp1d(l_cum_norm[inds], t_p_linspace_norm[inds], kind="cubic")
    t_user_progress     = l_cum_norm_inv_func(user_progress)

    assert min(t_user_progress) > -0.0000001
    assert max(t_user_progress) <  1.0000001

    t_user_progress = clip(t_user_progress,0,1)

    p_user_progress = zeros((num_samples_user_progress,num_dimensions))

    for di in range(num_dimensions):

        p_di_func             = scipy.interpolate.interp1d(t_p_linspace_norm, p[:,di].A1, kind="cubic")
        p_user_progress_di    = p_di_func(t_user_progress)
        p_user_progress[:,di] = p_user_progress_di

    t_user_progress_linspace_norm = linspace(0.0,1.0,len(user_progress))

    return p_user_progress, t_user_progress, l_cum, t_user_progress_linspace_norm
