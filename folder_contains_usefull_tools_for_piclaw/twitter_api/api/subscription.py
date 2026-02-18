from typing import Dict, Any, Optional

from ..core.client import TwitterAPIClient
from ..utils.constants import Endpoints
from ..utils.helpers import create_form_data

class SubscriptionAPI:
    """
    API for subscription-related operations.
    """
    
    def __init__(self, client: TwitterAPIClient):
        """
        Initialize the Subscription API.
        
        Args:
            client (TwitterAPIClient): Twitter API client
        """
        self.client = client
    
    async def verify_subscription(self) -> Optional[Dict[str, Any]]:
        """
        Verify subscription status.
        
        Returns:
            Optional[Dict[str, Any]]: Response from the API
        """
        params = {
            'variables': '{}'
        }
        return await self.client.get(Endpoints.VERIFY_SUBSCRIPTION, params=params)
    
    async def create_subscription(self, 
                                    payment_method_id: str, 
                                    subscription_type: str = "premium") -> Optional[Dict[str, Any]]:
        """
        Create a new subscription.
        
        Args:
            payment_method_id (str): Payment method ID
            subscription_type (str, optional): Subscription type. Defaults to "premium".
            
        Returns:
            Optional[Dict[str, Any]]: Response from the API
        """
        data = {
            "payment_method_id": payment_method_id,
            "subscription_type": subscription_type
        }
        
        form_data = create_form_data(data)
        return await self.client.post(Endpoints.CREATE_SUBSCRIPTION, data=form_data) 