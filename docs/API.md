# API ROUTES DOCUMENTATION

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication Routes
```
POST   /auth/create-new-user     - add new user 
POST   /auth/login              - Login user
POST   /auth/logout             - Logout user
POST   /auth/refresh            - Refresh access token
PUT    /auth/change-password    - Change password
POST   /auth/forgot-password    - Request password reset
POST   /auth/reset-password     - Reset password with token
```

## User Management Routes (Admin Only)

```

GET    /moderators                   - List all moderators (with pagination)
GET    /moderators/:id               - Get moderator by ID
POST   /moderators                   - Create new moderator
PUT    /moderators/:id               - Update moderator
DELETE /moderators/:id               - Delete moderator
PATCH  /moderators/:id/status        - status moderator

```

## Services Management Routes

```

GET    /services                - List all services (public)
GET    /services/:id            - Get service by ID
POST   /services                - Create new service (admin)
PUT    /services/:id            - Update service (admin)
DELETE /services/:id            - Delete service (admin)
GET    /services/active         - Get only active services

```

## Work Days Configuration Routes (Admin Only)

```
GET    /work-days               - Get all work days configuration
GET    /work-days/:day          - Get specific day configuration
PUT    /work-days/:day          - Update work day configuration
PATCH  /work-days/:day/toggle   - Toggle day as working/holiday
PUT    /work-days/:day/hours    - Update work hours for a day
GET    /work-days/working       - Get only working days

```

## Holidays Management Routes (Admin Only)

```
GET    /holidays                - List all holidays
GET    /holidays/:id            - Get holiday by ID
POST   /holidays                - Create new holiday
PUT    /holidays/:id            - Update holiday
DELETE /holidays/:id            - Delete holiday
GET    /holidays/upcoming       - Get upcoming holidays
GET    /holidays/year/:year     - Get holidays for specific year

```

## Special Hours/Rules Routes (Admin Only)
```
GET    /special-hours           - List all special hours
GET    /special-hours/:id       - Get special hours by ID
GET    /special-hours/date/:date - Get special hours for specific date
POST   /special-hours           - Create special hours rule
PUT    /special-hours/:id       - Update special hours
DELETE /special-hours/:id       - Delete special hours
```

## Calendar & Availability Routes
```
GET    /calendar/month/:year/:month  - Get calendar for month
GET    /calendar/check/:date         - Check if date is available
GET    /calendar/available-slots/:date - Get available time slots for date
GET    /calendar/working-days        - Get all configured working days
```

## Bookings Routes 
```
GET    /bookings                - List all bookings (admin sees all, user sees own)
GET    /bookings/:id            - Get booking by ID
POST   /bookings                - Create new booking
PUT    /bookings/:id            - Update booking
DELETE /bookings/:id            - Cancel booking
PATCH  /bookings/:id/confirm    - Confirm booking (admin)
PATCH  /bookings/:id/complete   - Mark booking as completed (admin)
GET    /bookings/user/:userId   - Get bookings for specific user
GET    /bookings/date/:date     - Get bookings for specific date
```



