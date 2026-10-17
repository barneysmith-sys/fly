# EXPLORER-4

EXPLORER-4 is the only playable aircraft in this build. It uses the nominal teaching quadcopter from `docs/RIGID_BODY.md`: mass 0.65 kg, arm 0.12 m, and a thrust ceiling of 3.2 times weight. Those numbers are round teaching values. They are not the specifications of a manufactured aircraft.

The flight controller is the existing cascaded attitude law. Stabilized mode levels roll and pitch. Acro mode commands body rates. Throttle is collective thrust. A first-order lag of 0.06 s sits between the mixer command and the force that enters the rigid body. That lag is a stand-in for motor spool-up. There is no ESC electrical model.

The stabilizer reads attitude and rate from the truth state. There is no IMU, GPS, or camera detector. The FPV image is a camera on the body pose.

Survey and research airframes are not in this build.
