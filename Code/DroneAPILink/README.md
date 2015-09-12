# Running this under SITL:

- Main MAVProxy inside VMWare sends UDP packets to OS X
--- using --out <osx_ip>:14900
- Slave MAVProxy on OS X listens for UDP Packets
--- using --master 0.0.0.0:14900


