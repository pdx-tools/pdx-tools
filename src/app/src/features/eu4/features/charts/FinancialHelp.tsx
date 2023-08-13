export const FinancialHelp = () => {
  return (
    <>
      <p>
        A nation's budget is composed of both recurring line items (taxes,
        production) and onetime payments (gifts, events, etc). The budget for a
        country is composed of three parts, last month's income, expenses, and
        the total expenses that the country has occurred in its existence. Total
        income is not recorded in the save.
      </p>
      <p>The game can reset accumulated expenses on tag switches</p>
      <p>Below are definitions of some of the fields</p>
      <dl>
        <dt className="mt-2 font-semibold">interest</dt>
        <dd>
          When talking about income, it's the amount in loans the given country
          has recently drawn. In this way the in-game ledger is bit of a
          misnomer, as no one should really count a loan as income or even label
          it as interest. When talking about expenses, interest is properly
          named.
        </dd>
        <dt className="mt-2 font-semibold">recurring income / expense</dt>
        <dd>
          EU4 records onetime payments in the income ledger. Examples of onetime
          payments are events, gifts, and even taking out loans. Since onetime
          payments can greatly skew income data, they can be excluded using a
          toggle.
        </dd>
      </dl>
    </>
  );
};
