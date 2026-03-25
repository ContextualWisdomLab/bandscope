from enum import Enum
from typing import TypedDict

class RoleType(str, Enum):
    INSTRUMENT = "instrument"

class Role(TypedDict):
    roleType: RoleType

r: Role = {"roleType": RoleType.INSTRUMENT}
r2: Role = {"roleType": RoleType.INSTRUMENT.value}
