from pydantic import BaseModel, EmailStr
from typing import Optional, List
from enum import Enum

class DocumentType(str, Enum):
    PASSPORT = "passport"
    DRIVERS_LICENSE = "drivers_license"
    ID_CARD = "id_card"

class VerificationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVIEW = "needs_review"

class Address(BaseModel):
    street: str
    city: str
    state: str
    postal_code: str
    country: str

class PersonalInfo(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: str
    address: Address
    email: EmailStr

class DocumentSubmission(BaseModel):
    document_type: DocumentType
    document_number: str
    expiry_date: str
    issuing_country: str
    document_front: str  # Base64 encoded image
    document_back: Optional[str] = None  # Base64 encoded image
    selfie: str  # Base64 encoded image

class VerificationRequest(BaseModel):
    personal_info: PersonalInfo
    documents: List[DocumentSubmission]

class VerificationResult(BaseModel):
    verification_id: str
    status: VerificationStatus
    confidence_score: float
    verified_fields: List[str]
    failed_fields: List[str]
    notes: Optional[str] = None