from datetime import datetime, timezone

from app.core.tag_tokens import encode_tags_list
from app.db.models import TagsUsed
from app.db.session import SessionLocal, init_db


def test_soft_deleted_tags_survive_database_initialization():
    db = SessionLocal()
    tag = TagsUsed(
        tag_name="test-persistent-soft-delete",
        is_persistent=False,
        tag_count=0,
        user_tag=True,
        deleted_at=datetime.now(timezone.utc),
    )
    db.add(tag)
    db.commit()
    tag_id = tag.id
    db.close()

    try:
        init_db()

        db = SessionLocal()
        try:
            persisted = db.query(TagsUsed).filter(TagsUsed.id == tag_id).one()
            assert persisted.deleted_at is not None
        finally:
            db.close()
    finally:
        db = SessionLocal()
        try:
            db.query(TagsUsed).filter(TagsUsed.id == tag_id).delete()
            db.commit()
        finally:
            db.close()


def test_encoding_restores_soft_deleted_tag_without_creating_duplicate():
    db = SessionLocal()
    tag = TagsUsed(
        tag_name="test-restored-upload-tag",
        is_persistent=False,
        tag_count=0,
        user_tag=True,
        deleted_at=datetime.now(timezone.utc),
    )
    db.add(tag)
    db.commit()
    tag_id = tag.id

    try:
        encoded, tag_ids = encode_tags_list(db, ["TEST-RESTORED-UPLOAD-TAG"])

        assert encoded == f"%tag{{{tag_id}}}"
        assert tag_ids == {tag_id}
        assert tag.deleted_at is None
        assert db.query(TagsUsed).filter(TagsUsed.tag_name == tag.tag_name).count() == 1
    finally:
        db.query(TagsUsed).filter(TagsUsed.id == tag_id).delete()
        db.commit()
        db.close()
