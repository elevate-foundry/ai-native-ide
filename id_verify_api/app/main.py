from fastapi import FastAPI, HTTPException
from .models import VerificationRequest, VerificationResult
from .services import VerificationService

app = FastAPI(
    title="Identity Verification API",
    description="API for verifying identity documents and personal information",
    version="1.0.0"
)

verification_service = VerificationService()

@app.post("/verify", response_model=VerificationResult)
async def verify_identity(request: VerificationRequest):
    """
    Submit an identity verification request.
    
    This endpoint accepts personal information and document images for verification.
    """
    try:
        result = verification_service.verify_identity(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/verify/{verification_id}", response_model=VerificationResult)
async def get_verification_status(verification_id: str):
    """
    Get the status of a verification request.
    """
    result = verification_service.get_verification_status(verification_id)
    if not result:
        raise HTTPException(status_code=404, detail="Verification not found")
    return result

@app.get("/")
async def root():
    return {
        "message": "Identity Verification API",
        "version": "1.0.0",
        "endpoints": {
            "verify": "POST /verify - Submit verification request",
            "status": "GET /verify/{verification_id} - Check verification status"
        }
    }