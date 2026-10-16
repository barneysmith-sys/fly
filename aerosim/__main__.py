"""CLI entry: python -m aerosim

Runs the 2 m hover and prints the trace summary. It does not start the API.
"""

from aerosim.simulation.runner import main

if __name__ == "__main__":
    main()
