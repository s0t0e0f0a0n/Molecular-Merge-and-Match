from fastapi import APIRouter

from app.api.exercises import router as exercises_router
from app.api.fragments import router as fragments_router
from app.api.health import router as health_router
from app.api.info import router as info_router
from app.api.logbook import router as logbook_router
from app.api.predefined_fragments import router as predefined_fragments_router
from app.api.reset import router as reset_router
from app.api.settings import router as settings_router
from app.api.statistics import router as statistics_router
from app.api.warnings import router as warnings_router
from app.api.working_solution import router as working_solution_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(info_router)
api_router.include_router(exercises_router)
api_router.include_router(fragments_router)
api_router.include_router(working_solution_router)
api_router.include_router(logbook_router)
api_router.include_router(predefined_fragments_router)
api_router.include_router(reset_router)
api_router.include_router(statistics_router)
api_router.include_router(warnings_router)
api_router.include_router(settings_router)
