from app.schemas.cooking_log import CookingLogStatus


def validate_cooking_ccp(core_temp: float, ccp_limit: float = 90.0) -> CookingLogStatus:
    """
    Validate cooking log against Critical Control Point (CCP) limit.
    
    Args:
        core_temp: Recorded core temperature in Celsius
        ccp_limit: CCP temperature limit (default 90.0°C)
    
    Returns:
        CookingLogStatus with validation result
    """
    if core_temp >= ccp_limit:
        return CookingLogStatus(
            status="PASS",
            message=f"Core temperature {core_temp}°C meets CCP limit of {ccp_limit}°C",
            requires_deviation=False
        )
    else:
        return CookingLogStatus(
            status="FAIL",
            message=f"Core temperature {core_temp}°C is below CCP limit of {ccp_limit}°C. Deviation record required.",
            requires_deviation=True
        )
