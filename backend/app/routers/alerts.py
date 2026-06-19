from fastapi import APIRouter

from ..mock_data import MOCK_ALERTS
from ..schema import AlertItem

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertItem])
def get_alerts():
    return MOCK_ALERTS
