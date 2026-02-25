from rest_framework.views import exception_handler
from rest_framework.response import Response

def custom_exception_handler(exc, context):
    # Call standard DRF exception handler first to get the standard error response
    response = exception_handler(exc, context)

    # If an exception happened that is not handled by DRF, response will be None
    if response is not None:
        # Standardize the format: {"error": True, "message": "...", "data": ...}
        custom_data = {
            "error": True,
            "message": str(exc),
            "data": response.data
        }
        
        # If it's a validation error, we might want a cleaner message
        if response.status_code == 400:
            custom_data["message"] = "Validation Error"
            
        response.data = custom_data

    return response
