# Gaze-Aware Automatic Question Generation to Increase Comprehension on Technical/Expert Videos using LLMs

## Project Summary

## Getting Started

### Prerequisites
- Install [Node.js](https://nodejs.org/en/download/)
- Next, install all dependencies
```
npm install
```
- Tobii Eye Tracker 5

### How to Run

1. Calibrate your Tobii Eye Tracker 5
   - Launch the Tobii Experience and click on "Improve calibration"
   - If Tobii Experience is not installed automatically when plugged in, download it [here](https://gaming.tobii.com/getstarted/)
2. Insert your OpenAI API key in `.env`
   - `OPENAI_API_KEY = 'INSERT OPEN AI KEY'`
3. Launch the app
```
npm start
```
*Note: this will start an eye tracker server and the application*