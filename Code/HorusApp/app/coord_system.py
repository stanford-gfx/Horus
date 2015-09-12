import numpy

LOCATION_SCALING_FACTOR = 111318.84502145034;

def scale_longitude(llh):
    return numpy.cos(llh[0] * numpy.pi / 180.0)

def llh2ned(llh, llh_ref):
    diffs = numpy.subtract(llh,llh_ref)
    diffs[0] = diffs[0] * LOCATION_SCALING_FACTOR
    diffs[1] = diffs[1] * LOCATION_SCALING_FACTOR * scale_longitude(llh_ref)
    return diffs

def ned2llh(ned, llh_ref):
  lat = llh_ref[0] + (ned[0] / LOCATION_SCALING_FACTOR)
  lng = llh_ref[1] + (ned[1] / (LOCATION_SCALING_FACTOR * scale_longitude(llh_ref)))
  alt = llh_ref[2] - ned[2]
  return numpy.array([lat,lng,alt])

def get_distance_llh(llh1, llh2):
  return numpy.linalg.norm(llh2ned(llh1, llh2))
