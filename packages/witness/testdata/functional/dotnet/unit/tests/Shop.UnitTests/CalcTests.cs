using NSubstitute;
using Xunit;

namespace Shop.UnitTests;

public class CalcTests
{
    [Fact]
    public void AddsTwoNumbers()
    {
        var clock = Substitute.For<IClock>();
        Assert.Equal(3, new Calc(clock).Add(1, 2));
    }
}
