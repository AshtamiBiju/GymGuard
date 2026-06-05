#include <MFRC522.h>
#include <MFRC522Extended.h>
#include <deprecated.h>
#include <require_cpp11.h>

#include <MFRC522.h>
#include <MFRC522Extended.h>
#include <deprecated.h>
#include <require_cpp11.h>


#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>

// --- WIFI + BACKEND CONFIG ---
const char* ssid = "ArdrAnil";
const char* password = "ardranil";
String backendURL = "http://192.168.2.126:3001/api/device/access";

#define SS_PIN      5
#define RST_PIN     4
#define IR_PIN      32
#define DOOR_SWITCH 33
#define EXIT_BUTTON 14
#define SERVO_PIN   13
#define BUZZER      26

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo myServo;

bool entryAuthorized = false;

void connectToWiFi() {
  WiFi.begin(ssid, password);

  lcd.clear();
  lcd.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Connected IP: ");
  Serial.println(WiFi.localIP());
}

String buildUid() {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toLowerCase();
  return uid;
}

void beepDenied() {
  digitalWrite(BUZZER, HIGH);
  delay(1000);
  digitalWrite(BUZZER, LOW);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  SPI.begin();
  rfid.PCD_Init();
  lcd.init();
  lcd.backlight();

  pinMode(IR_PIN, INPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(DOOR_SWITCH, INPUT_PULLUP);
  pinMode(EXIT_BUTTON, INPUT_PULLUP);

  myServo.attach(SERVO_PIN);
  myServo.write(0);

  connectToWiFi();

  lcd.clear();
  lcd.print("GYM SYSTEM READY");
  delay(1000);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  bool isDoorClosed = (digitalRead(DOOR_SWITCH) == LOW);

  if (digitalRead(EXIT_BUTTON) == LOW) {
    handleExit();
  }

  if (!isDoorClosed && !entryAuthorized) {
    triggerAlarm("FORCED ENTRY!");
  }

  if (!isDoorClosed) {
    lcd.setCursor(0, 0);
    lcd.print("CLOSE DOOR      ");
    return;
  }

  lcd.setCursor(0, 0);
  lcd.print("SCAN YOUR CARD  ");

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uid = buildUid();
  Serial.print("Scanned UID: ");
  Serial.println(uid);

  verifyCard(uid);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void handleExit() {
  lcd.clear();
  lcd.print("Exiting...");
  lcd.setCursor(0, 1);
  lcd.print("Goodbye!");

  myServo.write(90);
  entryAuthorized = true;

  delay(3000);

  while (digitalRead(DOOR_SWITCH) == HIGH) {
    lcd.setCursor(0, 1);
    lcd.print("PLEASE CLOSE    ");
    delay(100);
  }

  myServo.write(0);
  entryAuthorized = false;
  lcd.clear();
}

void verifyCard(String uid) {
  lcd.clear();
  lcd.print("Verifying...");

  if (WiFi.status() != WL_CONNECTED) {
    lcd.setCursor(0, 1);
    lcd.print("WiFi Offline");
    beepDenied();
    return;
  }

  HTTPClient http;
  String requestUrl = backendURL + "?uid=" + uid;

  Serial.print("Calling: ");
  Serial.println(requestUrl);

  http.begin(requestUrl);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  int httpCode = http.GET();
  String payload = http.getString();

  Serial.print("HTTP Code: ");
  Serial.println(httpCode);
  Serial.print("Payload: ");
  Serial.println(payload);

  if (httpCode > 0 && payload.indexOf("ALLOW") >= 0) {
    String name = "Member";

    if (payload.indexOf(":") != -1) {
      name = payload.substring(payload.indexOf(":") + 1);
    }

    lcd.clear();
    lcd.print("Welcome!");
    lcd.setCursor(0, 1);
    lcd.print(name);

    myServo.write(90);
    entryAuthorized = true;
    handleStrictEntry();

    while (digitalRead(DOOR_SWITCH) == HIGH) {
      delay(100);
    }

    myServo.write(0);
    entryAuthorized = false;
  } else {
    String reason = "Denied";

    if (payload.indexOf(":") != -1) {
      reason = payload.substring(payload.indexOf(":") + 1);
    }

    lcd.clear();
    lcd.print("Access Denied");
    lcd.setCursor(0, 1);
    lcd.print(reason.substring(0, 16));
    beepDenied();
  }

  http.end();
}

void handleStrictEntry() {
  unsigned long timer = millis();

  while (millis() - timer < 8000) {
    if (digitalRead(IR_PIN) == LOW) {
      while (digitalRead(IR_PIN) == LOW) {
        delay(10);
      }
      delay(1000);
      break;
    }
  }

  while (digitalRead(DOOR_SWITCH) == HIGH) {
    if (digitalRead(IR_PIN) == LOW) {
      triggerAlarm("TAILGATING!");
      return;
    }
    delay(10);
  }
}

void triggerAlarm(String msg) {
  lcd.clear();
  lcd.print("ALARM!");
  lcd.setCursor(0, 1);
  lcd.print(msg);

  for (int i = 0; i < 15; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(80);
    digitalWrite(BUZZER, LOW);
    delay(80);
  }
}
