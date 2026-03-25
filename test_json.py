import json
from enum import Enum

class RoleType(str, Enum):
    INSTRUMENT = "instrument"

print(json.dumps({"roleType": RoleType.INSTRUMENT}))
