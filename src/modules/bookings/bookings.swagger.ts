/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         clientEmail:
 *           type: string
 *         serviceId:
 *           type: string
 *         date:
 *           type: string
 *           format: date-time
 *         startTime:
 *           type: string
 *         endTime:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, CONFIRMED, COMPLETED, CANCELLED]
 *         meetLink:
 *           type: string
 *         calendarUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CreateBookingInput:
 *       type: object
 *       required:
 *         - serviceId
 *         - date
 *         - startTime
 *         - clientEmail
 *         - name
 *         - phone_number
 *       properties:
 *         serviceId:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         startTime:
 *           type: string
 *           format: time
 *           example: "14:00"
 *         clientEmail:
 *           type: string
 *           format: email
 *         name:
 *           type: string
 *         phone_number:
 *           type: string
 *     AvailabilityInput:
 *       type: object
 *       required:
 *         - date
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *         serviceDuration:
 *           type: number
 *           default: 60
 *     TimeSlot:
 *       type: object
 *       properties:
 *         startTime:
 *           type: string
 *         endTime:
 *           type: string
 *         available:
 *           type: boolean
 * 
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create a new booking request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBookingInput'
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid input or missing details
 *       500:
 *         description: Integration failure (Google/Email)
 * 
 *   get:
 *     tags: [Bookings]
 *     summary: Get all bookings (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of all bookings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 * 
 * /bookings/availability:
 *   get:
 *     tags: [Bookings]
 *     summary: Get available time slots
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date to check availability for (YYYY-MM-DD)
 *       - in: query
 *         name: serviceDuration
 *         schema:
 *           type: number
 *         description: Duration in minutes (default 60)
 *     responses:
 *       200:
 *         description: Available slots retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid date
 * 
 * /bookings/{id}/confirm:
 *   patch:
 *     tags: [Bookings]
 *     summary: Confirm a booking (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking confirmed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 * 
 * /bookings/{id}/complete:
 *   patch:
 *     tags: [Bookings]
 *     summary: Mark booking as completed (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 * 
 * /bookings/{id}/cancel:
 *   patch:
 *     tags: [Bookings]
 *     summary: Cancel a booking (Moderator/Admin only)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
