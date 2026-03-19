from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.user import User, UserRole


def run_seed() -> None:
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == 'admin@local').first()
        if not admin:
            admin = User(
                name='Administrador',
                email='admin@local',
                password_hash=get_password_hash('admin123'),
                role=UserRole.ADMIN,
                active=True,
            )
            db.add(admin)
        else:
            admin.name = 'Administrador'
            admin.password_hash = get_password_hash('admin123')
            admin.role = UserRole.ADMIN
            admin.active = True

        db.commit()
    finally:
        db.close()


if __name__ == '__main__':
    run_seed()
