import { Alert, Button, Space } from "antd";
import React, { useEffect, useState } from "react";

const ON_GOING_SURVEY = false;

export const AppSurvey: React.FC<{}> = () => {
  const [showSurvey, setShowSurvey] = useState(false);
  const [showSurveyReminder, setShowSurveyReminder] = useState(false);
  useEffect(() => {
    const survey = localStorage.getItem("survey");
    if (!survey || (survey !== "1" && survey !== "2")) {
      setShowSurvey(true);
    }
  }, []);

  const closeSurvey = () => {
    localStorage.setItem("survey", "1");
    setShowSurvey(false);
    setShowSurveyReminder(true);
  };

  const takeSurvey = () => {
    localStorage.setItem("survey", "2");
    setShowSurvey(false);
    return true;
  };

  if (!ON_GOING_SURVEY) {
    return null;
  }

  if (showSurvey) {
    return (
      <Alert
        type="info"
        message={
          <Space>
            PDX Tools user survey: a quick 7 question survey to improve PDX
            Tools for you.
            <Button>
              <a
                target="_blank"
                rel="noreferrer"
                href="https://docs.google.com/forms/d/e/1FAIpQLSdfDfU3gUtko_pM7fZPuv_T1Tp2-DrMYnvRtsUdxqIky6eTTw/viewform?usp=sf_link"
                onClick={takeSurvey}
              >
                Take it
              </a>
            </Button>
            <Button onClick={closeSurvey}>No Thanks</Button>
          </Space>
        }
        onClose={closeSurvey}
      />
    );
  } else if (showSurveyReminder) {
    return (
      <Alert
        type="info"
        message={
          <div>
            No worries, if you change your mind, you can find the survey link in
            the <a href="/blog/user-questionnaire">blog post</a>.
          </div>
        }
        closable
      />
    );
  } else {
    return null;
  }
};
