from fastapi import APIRouter, HTTPException

from ..mock_data import ALL_VENDORS, MOCK_SUMMARIES
from ..schema import VendorScore, VendorSummary

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorSummary])
def list_vendors():
    return MOCK_SUMMARIES


@router.get("/{vendor_id}", response_model=VendorScore)
def get_vendor(vendor_id: str):
    vendor = ALL_VENDORS.get(vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")
    return vendor
