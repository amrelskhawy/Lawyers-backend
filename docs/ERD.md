```mermaid
erDiagram
    USERS ||--o{ SERVICES : creates
    USERS ||--o{ HOLIDAYS : creates
    USERS ||--o{ SPECIAL_HOURS : creates
    USERS ||--o{ BOOKINGS : makes
    USERS ||--o{ AUDIT_LOGS : generates
    SERVICES ||--o{ BOOKINGS : "booked for"

    USERS {
        bigint id PK
        varchar username UK
        varchar email UK
        varchar password_hash
        enum role "admin, user"
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    SERVICES {
        bigint id PK
        varchar title_ar
        varchar title_en
        text description_ar
        text description_en
        decimal price
        varchar currency
        boolean is_active
        bigint created_by FK
        timestamp created_at
        timestamp updated_at
    }

    WORK_DAYS {
        bigint id PK
        enum day_of_week UK "monday-sunday"
        boolean is_working_day
        time start_time
        time end_time
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    HOLIDAYS {
        bigint id PK
        date date UK
        varchar name_ar
        varchar name_en
        text description_ar
        text description_en
        boolean is_recurring
        bigint created_by FK
        timestamp created_at
        timestamp updated_at
    }

    SPECIAL_HOURS {
        bigint id PK
        date date UK
        boolean is_holiday
        boolean is_half_day
        time start_time
        time end_time
        text notes
        bigint created_by FK
        timestamp created_at
        timestamp updated_at
    }

    BOOKINGS {
        bigint id PK
        bigint user_id FK
        bigint service_id FK
        date booking_date
        time booking_time
        enum status "pending, confirmed, cancelled, completed"
        text notes
        timestamp created_at
        timestamp updated_at
    }

    AUDIT_LOGS {
        bigint id PK
        bigint user_id FK
        varchar action
        varchar table_name
        bigint record_id
        json old_values
        json new_values
        varchar ip_address
        text user_agent
        timestamp created_at
    }
